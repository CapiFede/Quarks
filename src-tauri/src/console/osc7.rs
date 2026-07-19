//! Parser **streaming** del escape OSC 7, que el shell usa para anunciar su
//! cwd. Formato:
//!
//! ```text
//! ESC ] 7 ; file://<hostname>/<path> BEL
//! ESC ] 7 ; file://<hostname>/<path> ESC \   (ST: String Terminator)
//! ```
//!
//! Los bytes del PTY entran troceados arbitrariamente (no por sequence), así
//! que el parser mantiene estado entre llamadas: cuando detecta la apertura
//! `ESC ] 7 ;`, switchea a modo "collecting" y junta caracteres hasta el
//! terminador. El stream de bytes pasa entero a `xterm` igual (xterm ignora
//! el OSC al renderear); este módulo solo extrae el cwd para el tracking de
//! tabs del quark consola.
//!
//! El path viene URL-encoded; resolvemos el porcentaje básico (`%20`, `%23`,
//! etc.) y normalizamos las barras al separador del SO.

const ESC: u8 = 0x1B;
const BEL: u8 = 0x07;

/// Cota dura del payload de un OSC: descartamos secuencias gigantes para no
/// que un shell roto haga al parser crecer sin tope. 4 KB > cualquier path real.
const MAX_OSC_LEN: usize = 4096;

#[derive(Debug, Default)]
pub struct Osc7Parser {
    state: State,
    /// Buffer del payload OSC en curso (sin el header ni el terminador).
    buf: Vec<u8>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
enum State {
    /// Sin secuencia en curso. El próximo byte de interés es `ESC`.
    #[default]
    Idle,
    /// Vimos `ESC`. Esperamos `]` para confirmar OSC.
    GotEsc,
    /// Vimos `ESC ]`. Esperamos `7` (otros OSC los descartamos).
    GotOsc,
    /// Vimos `ESC ] 7`. Esperamos `;`.
    GotOsc7,
    /// Estamos juntando el payload. Termina con `BEL` o `ESC \`.
    Collecting,
    /// Dentro del payload, vimos un `ESC`: si viene `\` cerramos (ST).
    CollectingEscaped,
}

impl Osc7Parser {
    pub fn new() -> Self {
        Self::default()
    }

    /// Alimenta bytes del PTY y devuelve los cwd nuevos que cerraron en este
    /// chunk (suele ser cero o uno; pueden ser varios si el shell prompteó varias
    /// veces antes de leer). El stream original NO se modifica acá.
    pub fn feed(&mut self, chunk: &[u8]) -> Vec<String> {
        let mut out = Vec::new();
        for &b in chunk {
            match self.state {
                State::Idle => {
                    if b == ESC {
                        self.state = State::GotEsc;
                    }
                }
                State::GotEsc => {
                    self.state = if b == b']' { State::GotOsc } else { State::Idle };
                }
                State::GotOsc => {
                    self.state = if b == b'7' { State::GotOsc7 } else { State::Idle };
                    // Otros OSC: ignorar todo hasta el siguiente terminador
                    // sería más correcto, pero gastamos demasiado por algo que
                    // xterm igual procesa por su cuenta. Simplificamos: vuelvo
                    // a Idle y eventualmente engancho otro ESC.
                }
                State::GotOsc7 => {
                    if b == b';' {
                        self.buf.clear();
                        self.state = State::Collecting;
                    } else {
                        self.state = State::Idle;
                    }
                }
                State::Collecting => {
                    if b == BEL {
                        if let Some(cwd) = parse_payload(&self.buf) {
                            out.push(cwd);
                        }
                        self.buf.clear();
                        self.state = State::Idle;
                    } else if b == ESC {
                        self.state = State::CollectingEscaped;
                    } else if self.buf.len() >= MAX_OSC_LEN {
                        // Secuencia gigante: descarto sin emitir.
                        self.buf.clear();
                        self.state = State::Idle;
                    } else {
                        self.buf.push(b);
                    }
                }
                State::CollectingEscaped => {
                    if b == b'\\' {
                        if let Some(cwd) = parse_payload(&self.buf) {
                            out.push(cwd);
                        }
                        self.buf.clear();
                        self.state = State::Idle;
                    } else {
                        // No era ST: el ESC era parte del payload (raro). Lo
                        // reincorporo y sigo.
                        if self.buf.len() < MAX_OSC_LEN {
                            self.buf.push(ESC);
                        }
                        self.state = State::Collecting;
                    }
                }
            }
        }
        out
    }
}

/// Decodifica `file://host/path` (o `file:///path`) a un path local. Devuelve
/// `None` si el formato no matchea.
fn parse_payload(bytes: &[u8]) -> Option<String> {
    let s = std::str::from_utf8(bytes).ok()?;
    let rest = s.strip_prefix("file://")?;
    // Saltea el hostname. `file:///c:/x` ya empieza el path con `/`.
    let path = match rest.find('/') {
        Some(i) => &rest[i + 1..],
        None => return None,
    };
    let mut decoded = percent_decode(path);
    // En Windows el path queda tipo `c:/Users/...`. Normalizar `/` → `\`.
    if cfg!(windows) {
        decoded = decoded.replace('/', "\\");
        // Convertir `c:\...` → `C:\...` (capitalizar drive) por prolijidad.
        if let Some(c) = decoded.chars().next() {
            if c.is_ascii_lowercase() && decoded.as_bytes().get(1) == Some(&b':') {
                let mut s = String::with_capacity(decoded.len());
                s.push(c.to_ascii_uppercase());
                s.push_str(&decoded[1..]);
                decoded = s;
            }
        }
    } else {
        // En Unix el path es absoluto: el `/` que saltamos al separar host
        // pertenece al path → restituir.
        decoded = format!("/{}", decoded);
    }
    Some(decoded)
}

/// Mini decodificador percent-encoding: `%XX` → byte. Si una secuencia es
/// inválida, copia el `%` literal y sigue. Suficiente para OSC 7.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = hex(bytes[i + 1]);
            let lo = hex(bytes[i + 2]);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(10 + (b - b'a')),
        b'A'..=b'F' => Some(10 + (b - b'A')),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bel_terminated() {
        let mut p = Osc7Parser::new();
        let input = b"hello\x1b]7;file:///c:/Users/Fede\x07after";
        let r = p.feed(input);
        assert_eq!(r.len(), 1);
        if cfg!(windows) {
            assert_eq!(r[0], "C:\\Users\\Fede");
        } else {
            assert_eq!(r[0], "/c:/Users/Fede");
        }
    }

    #[test]
    fn parses_st_terminated() {
        let mut p = Osc7Parser::new();
        let input = b"\x1b]7;file:///tmp\x1b\\xx";
        let r = p.feed(input);
        assert_eq!(r.len(), 1);
    }

    #[test]
    fn handles_split_chunks() {
        let mut p = Osc7Parser::new();
        assert!(p.feed(b"\x1b]7").is_empty());
        assert!(p.feed(b";file:///").is_empty());
        let r = p.feed(b"tmp\x07");
        assert_eq!(r.len(), 1);
    }
}

// Permite importar assets binarios como URL (Vite los resuelve a la URL final).
declare module "*.wav" {
  const url: string;
  export default url;
}

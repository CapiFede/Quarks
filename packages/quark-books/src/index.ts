/**
 * Punto de entrada del quark Libros. Exporta la instancia que el registry del
 * core importa y registra (`@quarks/quark-books`).
 */
import { createBooksQuark } from "./BooksQuark";

export const booksQuark = createBooksQuark();

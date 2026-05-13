import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../domain/entities/book.dart';
import 'books_storage_service.dart';

class PdfExportService {
  PdfExportService(this._storage);

  final BooksStorageService _storage;

  /// Generates the PDF and writes it next to the book's folder as title.pdf.
  /// Returns the absolute path of the resulting file.
  Future<String> exportBook(Book book) async {
    final root = await _storage.booksDir;
    final folder = _storage.bookFolder(root, book.folderName);
    if (!await folder.exists()) {
      throw StateError('Carpeta del libro no encontrada: ${folder.path}');
    }

    final doc = pw.Document(
      title: book.title,
      author: book.author.isEmpty ? null : book.author,
    );

    // Times Roman ships with the pdf package — no asset bundle required.
    final font = pw.Font.times();
    final boldFont = pw.Font.timesBold();
    final italicFont = pw.Font.timesItalic();

    final pageTheme = pw.PageTheme(
      pageFormat: const PdfPageFormat(
        168 * PdfPageFormat.mm,
        243 * PdfPageFormat.mm,
        marginLeft: 25 * PdfPageFormat.mm,
        marginRight: 19 * PdfPageFormat.mm,
        marginTop: 19 * PdfPageFormat.mm,
        marginBottom: 19 * PdfPageFormat.mm,
      ),
      theme: pw.ThemeData.withFont(
        base: font,
        bold: boldFont,
        italic: italicFont,
      ),
    );

    const paragraphStyle = pw.TextStyle(
      fontSize: 11.5,
      lineSpacing: 2.5,
    );
    final chapterTitleStyle = pw.TextStyle(
      fontSize: 18,
      fontWeight: pw.FontWeight.bold,
    );

    // Cover page (single).
    doc.addPage(
      pw.Page(
        pageTheme: pageTheme,
        build: (ctx) => pw.Center(
          child: pw.Column(
            mainAxisAlignment: pw.MainAxisAlignment.center,
            children: [
              pw.Text(book.title,
                  style: pw.TextStyle(
                      fontSize: 28, fontWeight: pw.FontWeight.bold),
                  textAlign: pw.TextAlign.center),
              if (book.author.isNotEmpty) ...[
                pw.SizedBox(height: 24),
                pw.Text(book.author,
                    style: const pw.TextStyle(fontSize: 14),
                    textAlign: pw.TextAlign.center),
              ],
            ],
          ),
        ),
      ),
    );

    // One MultiPage per chapter so each chapter starts on a fresh page and
    // long chapters paginate naturally.
    for (final chapter in book.chapters) {
      final content = await _storage.readChapter(book, chapter.id);
      final paragraphs = _splitParagraphs(content);
      doc.addPage(
        pw.MultiPage(
          pageTheme: pageTheme,
          build: (ctx) => [
            pw.Header(
              level: 0,
              child: pw.Text(chapter.title, style: chapterTitleStyle),
            ),
            pw.SizedBox(height: 12),
            for (final para in paragraphs)
              pw.Padding(
                padding: const pw.EdgeInsets.only(bottom: 2),
                child: pw.Text(
                  para,
                  style: paragraphStyle,
                  textAlign: pw.TextAlign.justify,
                ),
              ),
          ],
        ),
      );
    }

    final bytes = await doc.save();
    final safeTitle = BooksStorageService.safeName(book.title);
    final outFile = File(p.join(folder.path, '$safeTitle.pdf'));
    await outFile.writeAsBytes(bytes);
    return outFile.path;
  }

  static List<String> _splitParagraphs(String content) {
    if (content.trim().isEmpty) return const [];
    return content
        .split(RegExp(r'\n\s*\n'))
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();
  }
}

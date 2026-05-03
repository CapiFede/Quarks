import '../../domain/entities/category.dart';
import '../../domain/entities/note.dart';
import '../../domain/repositories/notes_repository.dart';
import '../services/notes_storage_service.dart';

class NotesRepositoryImpl implements NotesRepository {
  NotesRepositoryImpl(this._storage);

  final NotesStorageService _storage;

  List<Note>? _notesCache;
  List<Category>? _categoriesCache;

  @override
  Future<List<Note>> getNotes() async {
    _notesCache ??= await _storage.loadNotes();
    return List.unmodifiable(_notesCache!);
  }

  @override
  Future<List<Category>> getCategories() async {
    _categoriesCache ??= await _storage.loadCategories();
    return List.unmodifiable(_categoriesCache!);
  }

  @override
  Future<void> saveNote(Note note) async {
    final notes = List<Note>.from(await getNotes());
    final index = notes.indexWhere((n) => n.id == note.id);
    if (index >= 0) {
      notes[index] = note;
    } else {
      notes.add(note);
    }
    _notesCache = notes;
    await _storage.saveNote(note);
  }

  @override
  Future<void> deleteNote(String id) async {
    final notes = List<Note>.from(await getNotes())
      ..removeWhere((n) => n.id == id);
    _notesCache = notes;
    await _storage.deleteNote(id);
  }

  @override
  Future<void> saveCategory(Category category) async {
    final categories = List<Category>.from(await getCategories());
    final index = categories.indexWhere((c) => c.id == category.id);
    if (index >= 0) {
      categories[index] = category;
    } else {
      categories.add(category);
    }
    _categoriesCache = categories;
    await _storage.saveCategories(categories);
  }

  @override
  Future<void> deleteCategory(String id) async {
    final categories = List<Category>.from(await getCategories())
      ..removeWhere((c) => c.id == id);
    _categoriesCache = categories;
    await _storage.saveCategories(categories);
    // Notes with this category become uncategorised
    final notes = List<Note>.from(await getNotes());
    final updated = <Note>[];
    for (final n in notes) {
      final u = n.categoryId == id ? n.copyWith(categoryId: null) : n;
      updated.add(u);
      if (n.categoryId == id) await _storage.saveNote(u);
    }
    _notesCache = updated;
  }
}

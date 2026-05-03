import '../entities/category.dart';
import '../entities/note.dart';

abstract class NotesRepository {
  Future<List<Note>> getNotes();
  Future<List<Category>> getCategories();
  Future<void> saveNote(Note note);
  Future<void> deleteNote(String id);
  Future<void> saveCategory(Category category);
  Future<void> deleteCategory(String id);
}

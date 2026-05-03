import '../../domain/entities/category.dart';
import '../../domain/entities/note.dart';

class NotesState {
  final List<Note> notes;
  final List<Category> categories;
  final String? selectedCategoryId; // null = all notes
  final String searchQuery;

  const NotesState({
    this.notes = const [],
    this.categories = const [],
    this.selectedCategoryId,
    this.searchQuery = '',
  });

  NotesState copyWith({
    List<Note>? notes,
    List<Category>? categories,
    Object? selectedCategoryId = _sentinel,
    String? searchQuery,
  }) {
    return NotesState(
      notes: notes ?? this.notes,
      categories: categories ?? this.categories,
      selectedCategoryId: selectedCategoryId == _sentinel
          ? this.selectedCategoryId
          : selectedCategoryId as String?,
      searchQuery: searchQuery ?? this.searchQuery,
    );
  }
}

const _sentinel = Object();

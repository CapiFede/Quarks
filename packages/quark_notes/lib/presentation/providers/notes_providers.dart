import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/notes_repository_impl.dart';
import '../../data/services/notes_storage_service.dart';
import '../../domain/entities/category.dart';
import '../../domain/entities/note.dart';
import '../../domain/repositories/notes_repository.dart';
import 'notes_state.dart';

final notesStorageServiceProvider = Provider<NotesStorageService>((ref) {
  return NotesStorageService();
});

final notesRepositoryProvider = Provider<NotesRepository>((ref) {
  return NotesRepositoryImpl(ref.read(notesStorageServiceProvider));
});

final notesProvider =
    AsyncNotifierProvider<NotesNotifier, NotesState>(NotesNotifier.new);

// null = list view, 'new' = create new note, any other id = edit existing
final activeNoteIdProvider = StateProvider<String?>((ref) => null);

// null = nothing selected; any note id = that note is selected in the list view
final selectedNoteIdProvider = StateProvider<String?>((ref) => null);

final filteredNotesProvider = Provider<List<Note>>((ref) {
  final state = ref.watch(notesProvider).valueOrNull;
  if (state == null) return [];

  var notes = state.notes;

  if (state.selectedCategoryId != null) {
    notes = notes
        .where((n) => n.categoryId == state.selectedCategoryId)
        .toList();
  }

  final query = state.searchQuery.toLowerCase();
  if (query.isNotEmpty) {
    notes = notes.where((n) {
      final nameMatch = (n.name ?? '').toLowerCase().contains(query);
      final contentMatch = _stripQuillDelta(n.content).toLowerCase().contains(query);
      return nameMatch || contentMatch;
    }).toList();
  }

  notes = [...notes]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return notes;
});

String _stripQuillDelta(String deltaJson) {
  try {
    // Quick plain-text extraction from quill delta JSON
    // Delta format: [{"insert": "text"}, ...]
    final regex = RegExp(r'"insert"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"');
    return regex.allMatches(deltaJson).map((m) => m.group(1) ?? '').join(' ');
  } catch (_) {
    return '';
  }
}

class NotesNotifier extends AsyncNotifier<NotesState> {
  late final NotesRepository _repo;

  @override
  Future<NotesState> build() async {
    _repo = ref.read(notesRepositoryProvider);
    final notes = await _repo.getNotes();
    final categories = await _repo.getCategories();
    return NotesState(notes: notes, categories: categories);
  }

  void selectCategory(String? id) {
    final current = state.requireValue;
    state = AsyncData(current.copyWith(selectedCategoryId: id));
  }

  void setSearchQuery(String query) {
    final current = state.requireValue;
    state = AsyncData(current.copyWith(searchQuery: query));
  }

  Future<Note> createNote() async {
    const marfil = Color(0xFFFAF8F3);
    final note = Note(
      id: Note.generateId(),
      colorValue: marfil.toARGB32(),
      createdAt: DateTime.now(),
    );
    await _repo.saveNote(note);
    final current = state.requireValue;
    state = AsyncData(current.copyWith(notes: [...current.notes, note]));
    return note;
  }

  Future<void> saveNote(Note note) async {
    await _repo.saveNote(note);
    final current = state.requireValue;
    final notes = List<Note>.from(current.notes);
    final index = notes.indexWhere((n) => n.id == note.id);
    if (index >= 0) {
      notes[index] = note;
    } else {
      notes.add(note);
    }
    state = AsyncData(current.copyWith(notes: notes));
  }

  Future<void> deleteNote(String id) async {
    await _repo.deleteNote(id);
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(
        notes: current.notes.where((n) => n.id != id).toList(),
      ),
    );
  }

  Future<void> createCategory(String name) async {
    final category = Category(
      id: Category.generateId(),
      name: name,
      createdAt: DateTime.now(),
    );
    await _repo.saveCategory(category);
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(categories: [...current.categories, category]),
    );
  }

  Future<void> renameCategory(String id, String newName) async {
    final current = state.requireValue;
    final category = current.categories.firstWhere((c) => c.id == id);
    final updated = category.copyWith(name: newName);
    await _repo.saveCategory(updated);
    final categories = List<Category>.from(current.categories);
    final index = categories.indexWhere((c) => c.id == id);
    categories[index] = updated;
    state = AsyncData(current.copyWith(categories: categories));
  }

  Future<void> deleteCategory(String id) async {
    await _repo.deleteCategory(id);
    final current = state.requireValue;
    final categories = current.categories.where((c) => c.id != id).toList();
    final notes = current.notes.map((n) {
      if (n.categoryId == id) return n.copyWith(categoryId: null);
      return n;
    }).toList();
    final selectedCategoryId =
        current.selectedCategoryId == id ? null : current.selectedCategoryId;
    state = AsyncData(current.copyWith(
      categories: categories,
      notes: notes,
      selectedCategoryId: selectedCategoryId,
    ));
  }
}

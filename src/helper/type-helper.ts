import type { FilterQuery, SearchQuery, UpdateSet, ValidPath } from "../types";

export function defineFilter<T>(filter: FilterQuery<T>): FilterQuery<T> {
  return filter;
}

export function defineQuery<T>(query: SearchQuery<T>): SearchQuery<T> {
  return query;
}

export function defineUpdateSet<T>(set: UpdateSet<T>): UpdateSet<T> {
  return set;
}

export function defineProjection<T>(p: ValidPath<T>[]): ValidPath<T>[] {
  return p;
}

export function defineInsertValue<T>(data: T): T {
  return data;
}

export function asIsType<T>(value: unknown): value is T {
  return true;
}

export function asType<T>(value: unknown): T {
  return value as T;
}

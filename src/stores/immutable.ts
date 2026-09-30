import type { DeepReadonly } from '$contracts';

/** Only objects frozen recursively by this module can be reused without inspection. */
const frozen = new WeakSet<object>();

export function freezeOwned<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !frozen.has(value)) {
    Object.values(value).forEach(child => freezeOwned(child));
    Object.freeze(value);
    frozen.add(value);
  }
  return value as DeepReadonly<T>;
}

/** Detach caller-owned JSON while retaining immutable subtrees already owned here. */
export function detach<T>(value: T): T {
  if (!value || typeof value !== 'object' || frozen.has(value)) return value;
  if (Array.isArray(value)) return value.map(child => detach(child)) as T;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, detach(child)])) as T;
}

export const immutable = <T>(value: T): DeepReadonly<T> => freezeOwned(detach(value));

let counter = 0;

// Generate deterministic UUID v4-format strings for testing
export const v4 = (): string => {
  counter++;
  const hex = counter.toString(16).padStart(12, "0");
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y is 8, 9, a, or b
  return `00000000-0000-4000-a000-${hex}`;
};

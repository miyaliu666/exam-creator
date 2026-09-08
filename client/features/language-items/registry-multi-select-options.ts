export interface RegistryMultiSelectOption {
  id: string;
  label: string;
}

export function toggleRegistrySelection(values: string[], id: string): string[] {
  // Unknown saved references belong to the parent's invalid-selection UI, not this picker.
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

export function registryOptionNames(
  options: RegistryMultiSelectOption[],
  displayText: (value: string) => string,
): RegistryMultiSelectOption[] {
  return options.map((option) => {
    const label = displayText(option.label).trim();
    const isBareCode = label === option.id && /^(?:[A-Z][A-Z0-9]*-[A-Za-z0-9_.:-]+|D\d{2})$/.test(label);
    return { id: option.id, label: !label || isBareCode ? "Unnamed option" : label };
  });
}

export function filterRegistryOptions(options: RegistryMultiSelectOption[], query: string) {
  const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
  const search = normalize(query);
  return options.filter((option) => normalize(option.label).includes(search));
}

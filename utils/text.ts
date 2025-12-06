export function stripHtmlTags(value?: string | null): string {
  if (!value) {
    return '';
  }

  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function truncateText(value: string, length = 120): string {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length - 1).trim()}…`;
}

import * as fs from 'fs';
import * as path from 'path';

type ChangelogSection = {
  date: string;
  startIndex: number;
  endIndex: number;
};

function parseDaysArg(argv: string[]): number {
  const arg = argv.find((value) => value.startsWith('--days='));
  if (!arg) return 7;
  const parsed = Number(arg.split('=')[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return 7;
  return Math.floor(parsed);
}

function parseIsoDateUtc(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatIsoDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function collectDateSections(lines: string[]): ChangelogSection[] {
  const headingRegex = /^###\s*\[?(\d{4}-\d{2}-\d{2})\]?/;
  const starts: Array<{ idx: number; date: string }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(headingRegex);
    if (match) {
      starts.push({ idx: i, date: match[1] });
    }
  }

  const sections: ChangelogSection[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const next = starts[i + 1];
    sections.push({
      date: start.date,
      startIndex: start.idx,
      endIndex: next ? next.idx : lines.length,
    });
  }
  return sections;
}

function trimEmptyEdges(values: string[]): string[] {
  let start = 0;
  let end = values.length - 1;
  while (start <= end && values[start].trim() === '') start += 1;
  while (end >= start && values[end].trim() === '') end -= 1;
  return values.slice(start, end + 1);
}

function buildWeeklyDoc(changelogPath: string, days: number): string {
  const raw = fs.readFileSync(changelogPath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const sections = collectDateSections(lines);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const windowStart = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const inWindow = sections.filter((section) => {
    const date = parseIsoDateUtc(section.date);
    return date >= windowStart && date <= today;
  });

  const out: string[] = [];
  out.push('# Technical Weekly Update');
  out.push('');
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push(`Window: ${formatIsoDateUtc(windowStart)} to ${formatIsoDateUtc(today)} (${days} days)`);
  out.push(`Source: \`${path.relative(process.cwd(), changelogPath)}\``);
  out.push('');

  if (inWindow.length === 0) {
    out.push('No changelog sections in this time window.');
    out.push('');
    return out.join('\n');
  }

  for (const section of inWindow) {
    const body = trimEmptyEdges(lines.slice(section.startIndex + 1, section.endIndex));
    out.push(`## ${section.date}`);
    out.push('');
    if (body.length === 0) {
      out.push('- No entries.');
    } else {
      out.push(...body);
    }
    out.push('');
  }

  return out.join('\n');
}

function main(): void {
  const days = parseDaysArg(process.argv.slice(2));
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  const outputPath = path.join(process.cwd(), 'docs', 'TECHNICAL_WEEKLY.md');

  if (!fs.existsSync(changelogPath)) {
    throw new Error(`Missing CHANGELOG file: ${changelogPath}`);
  }

  const result = buildWeeklyDoc(changelogPath, days);
  fs.writeFileSync(outputPath, result, 'utf-8');
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)} (${days}-day window).`);
}

main();

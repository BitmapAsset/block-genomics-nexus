/** @jest-environment jsdom */
/**
 * The docs pages tell their links apart from the sentence around them without relying on colour (an underline at
 * rest), and the parts that scroll sideways (code blocks, wide tables) can be reached with the Tab key so a keyboard
 * can scroll them.
 */
import * as React from 'react';
import { render, screen, within } from '@testing-library/react';

import CliReferencePage from '@/app/(site)/docs/cli/page';
import ApiReferencePage from '@/app/(site)/docs/api/page';
import ExperienceHostingPage from '@/app/(site)/docs/experience-hosting/page';
import CodeBlock from '@/app/(site)/docs/CodeBlock';

function underlineOf(el: HTMLElement | undefined): string | undefined {
  return el?.style.textDecorationLine;
}

function tableWrapper(table: HTMLElement): HTMLElement {
  const wrapper = table.parentElement as HTMLElement;
  expect(wrapper.className).toContain('overflow-x-auto');
  return wrapper;
}

describe('docs links are underlined at rest', () => {
  it('/docs/cli: the breadcrumb "Docs" link is underlined', () => {
    render(<CliReferencePage />);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const docs = within(crumbs).getByRole('link', { name: 'Docs' });
    expect(underlineOf(docs)).toBe('underline');
  });

  it('/docs/cli: a link inside the text ("CLI quickstart") is underlined', () => {
    render(<CliReferencePage />);
    const link = screen.getByRole('link', { name: 'CLI quickstart' });
    expect(link.closest('p')).not.toBeNull();
    expect(underlineOf(link)).toBe('underline');
  });

  it('/docs/experience-hosting: the links inside its notes are underlined', () => {
    render(<ExperienceHostingPage />);
    expect(underlineOf(screen.getByRole('link', { name: 'block-genomics' }))).toBe('underline');
    const spec = screen.getAllByRole('link', { name: 'Nexus Protocol specification' }).find((a) => a.closest('p'));
    expect(spec).toBeDefined();
    expect(underlineOf(spec)).toBe('underline');
  });
});

describe('code blocks and wide tables are keyboard focusable', () => {
  it('a code block\'s scrolling <pre> is a tab stop', () => {
    const { container } = render(<CodeBlock code="npx block-genomics verify 840000" title="verify" />);
    const pre = container.querySelector('pre') as HTMLElement;
    expect(pre).not.toBeNull();
    expect(pre.tabIndex).toBe(0);
    expect(pre.getAttribute('tabindex')).toBe('0');
  });

  it('/docs/cli: the commands table wrapper is a tab stop', () => {
    render(<CliReferencePage />);
    const wrapper = tableWrapper(screen.getByRole('table'));
    expect(wrapper.getAttribute('tabindex')).toBe('0');
  });

  it('/docs/api: the endpoints table wrapper is a tab stop', () => {
    render(<ApiReferencePage />);
    const wrapper = tableWrapper(screen.getByRole('table'));
    expect(wrapper.getAttribute('tabindex')).toBe('0');
  });

  it('/docs/experience-hosting: the API table wrapper is a tab stop', () => {
    render(<ExperienceHostingPage />);
    const wrapper = tableWrapper(screen.getByRole('table'));
    expect(wrapper.getAttribute('tabindex')).toBe('0');
  });
});

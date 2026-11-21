// The Settings page: the page and the profile language the app opens in, kept in this browser.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '../helpers';

afterEach(() => {
  localStorage.clear();
  vi.resetModules();
});

// Fresh modules each time: the stores read localStorage when they're first imported, as on opening the app.
const load = async () => ({
  settings: await import('../../src/settings'),
  language: await import('../../src/language'),
  SettingsPage: (await import('../../src/pages/SettingsPage')).default,
});

describe('settings', () => {
  it('saves the start page and start language on Apply, and shows the language straight away', async () => {
    const { settings, language, SettingsPage } = await load();
    const user = userEvent.setup();
    renderWithQuery(<SettingsPage />);
    expect(screen.getByRole('combobox', { name: 'Start page' })).toHaveValue('about');
    expect(screen.getByRole('button', { name: 'Last used' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Start page' }), 'Activities');
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    expect(screen.getByRole('button', { name: 'ไทย' })).toHaveAttribute('aria-pressed', 'true');
    // Nothing changes until Apply.
    expect(settings.getSettings()).toEqual({ startPage: 'about', startLanguage: '' });
    expect(localStorage.getItem('settings')).toBeNull();
    expect(localStorage.getItem('language')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('status')).toHaveTextContent('Applied');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(settings.getSettings()).toEqual({ startPage: 'activities', startLanguage: 'th' });
    expect(JSON.parse(localStorage.getItem('settings')!)).toEqual({ startPage: 'activities', startLanguage: 'th' });
    expect(localStorage.getItem('language')).toBe('th');
    language.setLanguage('en');
  });

  it('puts back the saved choices on Discard changes', async () => {
    const { settings, SettingsPage } = await load();
    const user = userEvent.setup();
    renderWithQuery(<SettingsPage />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Start page' }), 'Posts');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('combobox', { name: 'Start page' })).toHaveValue('about');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(settings.getSettings().startPage).toBe('about');
  });

  it('opens in the start language even when another was used last', async () => {
    localStorage.setItem('settings', JSON.stringify({ startPage: 'about', startLanguage: 'th' }));
    localStorage.setItem('language', 'en');
    const { language } = await load();
    function Shown() {
      return <span>{language.useLanguage()}</span>;
    }
    renderWithQuery(<Shown />);
    expect(screen.getByText('th')).toBeInTheDocument();
  });

  it('opens in the language used last when set to Last used', async () => {
    localStorage.setItem('settings', JSON.stringify({ startPage: 'about', startLanguage: '' }));
    localStorage.setItem('language', 'th');
    const { language } = await load();
    function Shown() {
      return <span>{language.useLanguage()}</span>;
    }
    renderWithQuery(<Shown />);
    expect(screen.getByText('th')).toBeInTheDocument();
  });

  it('ignores a start page that no longer exists, and anything unreadable', async () => {
    localStorage.setItem('settings', JSON.stringify({ startPage: 'gone', startLanguage: 'fr' }));
    expect((await load()).settings.getSettings()).toEqual({ startPage: 'about', startLanguage: '' });
    vi.resetModules();
    localStorage.setItem('settings', '{not json');
    expect((await load()).settings.getSettings()).toEqual({ startPage: 'about', startLanguage: '' });
  });
});

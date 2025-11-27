import path from 'node:path';
import { test, expect } from '@playwright/test';
import { resetTestDatabase } from '../utils/db';
import { listDependents } from '../utils/api';

const SCENARIO_ONE_SEED = path.join(
  'src',
  '@tests',
  'llm-smoke',
  'chat-tests',
  'scenario-one',
  'seed.json'
);

test.beforeEach(async () => {
  await resetTestDatabase({ seedPath: SCENARIO_ONE_SEED });
});

test('test', async ({ page }) => {
  await page.goto('http://127.0.0.1:3001/t');
  await page.getByRole('button', { name: 'Add Profile' }).click();
  await page.getByRole('textbox', { name: 'Relationship Identifier' }).fill('new test');
  await page.getByRole('textbox', { name: 'Legal First Name' }).click();
  await page.getByRole('textbox', { name: 'Legal First Name' }).fill('TestFirst');
  await page.getByRole('textbox', { name: 'Legal First Name' }).press('Tab');
  await page.getByRole('textbox', { name: 'Legal Last Name' }).fill('TestLast');
  await page.getByRole('textbox', { name: 'Legal Last Name' }).press('Tab');
  await page.getByRole('combobox', { name: 'Sex' }).click();
  await page.getByRole('option', { name: 'Male', exact: true }).click();
  await page.getByRole('textbox', { name: 'Date of Birth' }).fill('1998-08-19');
  await page.getByRole('button', { name: 'Create Profile' }).click();
  await expect(page.getByRole('main').getByText('new test')).toBeVisible();
  await page.getByRole('button', { name: 'Reveal PHI' }).click();
  await expect(page.getByText('TestFirst TestLast')).toBeVisible();
  await expect(page.getByText('8/19/')).toBeVisible();
  await expect(page.getByText('male')).toBeVisible();
  await page.getByRole('button', { name: 'Profile actions' }).click();
  await page.getByRole('button', { name: 'Delete profile' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect
    .poll(async () => {
      const dependents = await listDependents();
      return dependents.some(dep => dep.record_identifier === 'new test');
    })
    .toBeFalsy();
});
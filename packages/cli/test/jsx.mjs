// Import this first in a test that renders .jsx: it registers test/jsx-hooks.mjs for the rest of the process.
import { register } from 'node:module';

register('./jsx-hooks.mjs', import.meta.url);

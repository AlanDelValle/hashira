import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

/*
 * Testing Library unmounts what a test rendered only when it can register an `afterEach`
 * itself, which needs Vitest's globals — and this project does not enable them. Without this,
 * every component a test renders stays in the document for the rest of the file: the next
 * test's queries find the previous test's markup, and anything that reacts to a store keeps
 * reacting long after the test that mounted it finished.
 */
afterEach(cleanup);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Application } from '@/Application';

const container = document.getElementById('app');

if (container === null) {
    throw new Error('Missing #app mount point — check resources/views/app.blade.php.');
}

createRoot(container).render(
    <StrictMode>
        <Application />
    </StrictMode>,
);

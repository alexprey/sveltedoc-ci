import { handleFullSearch } from './common/download.js';

const searchTerms = [
    'from "svelte" language:Svelte',
    '<script lang="ts"> language:Svelte',
    '<script> language:Svelte',
    'createEventDispatcher language:Svelte'
];

(async () => {
    const tasks = searchTerms.map(searchTerm => {
        console.log(`Try to download for: ${searchTerm}`)
        return handleFullSearch(searchTerm);
    });

    Promise.all(tasks);
})();
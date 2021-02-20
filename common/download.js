import request from 'request';
import cherio from 'cheerio';
import fs from 'fs';
import path, { resolve } from 'path';

const default_headers = {
};

let downloadedFilesCount = 0;
let failedFilesCount = 0;

function parseSearchPageOutput(body) {
    return new Promise(resolve => {
        const $ = cherio.load(body);
        const items = $('.code-list .f4 a');

        const parsedItems = items.toArray().map((link) => {
            const $link = $(link);

            const decodedHref = decodeURIComponent($link.attr('href'));

            return {
                file: $link.text(),
                uniqueFilePath: decodedHref,
                href: 'https://github.com/' + decodedHref,
                raw:
                    'https://github.com/' +
                    decodedHref.replace('/blob/', '/raw/'),
            };
        });

        resolve(parsedItems);
    });
}

function downloadFileFromSearchItem(pageNumber, item) {
    return new Promise((resolve) => {
        request.get(
            item.raw,
            {
                headers: default_headers,
            },
            (e, response) => {
                const content = response.body;

                const targetPath = path.join(
                    process.cwd(),
                    'files',
                    item.uniqueFilePath
                );

                try {
                    fs.mkdirSync(path.dirname(targetPath), {
                        recursive: true,
                        mode: '777',
                    });
                    fs.writeFileSync(targetPath, content);

                    downloadedFilesCount++;
                    console.log(`[${pageNumber} :: ${downloadedFilesCount} :: ${failedFilesCount}] ${targetPath}`);
                } catch(e) {
                    failedFilesCount++;
                    console.log(`[${pageNumber} :: ${downloadedFilesCount} :: ${failedFilesCount}] ${targetPath} = ${e.message}`);
                }

                resolve();
            }
        );
    });
}

function downloadSearchPageContent(searchTerm, pageNumber) {
    return new Promise((resolve) => {
        request.get(
            `https://github.com/search?p=${pageNumber}&q=${encodeURIComponent(searchTerm)}&type=Code`,
            {
                headers: default_headers,
            },
            (err, response) => {
                resolve(response);
            }
        );
    });
}

async function downloadFilesFromSearch(searchTerm, pageNumber) {
    const response = await downloadSearchPageContent(searchTerm, pageNumber);
    if (response.statusCode !== 200) {
        console.log(`Received unexpected status code ${response.statusCode}`);
        return false;
    }

    const items = await parseSearchPageOutput(response.body);

    const jobs = items.map(item => downloadFileFromSearchItem(pageNumber, item));

    await Promise.all(jobs);

    return true;
}

export async function handleFullSearch(searchTerm) {
    return new Promise(() => {
        let pageNumber = 1;

        const handler = () => {
            downloadFilesFromSearch(searchTerm, pageNumber++)
                .then((isDone) => {
                    if (!isDone) {
                        console.log(`Completed at ${pageNumber} page`);
                        console.log(`Downloaded files count: ${downloadedFilesCount}`);
                        console.log(`Failed files count: ${failedFilesCount}`);
                        resolve();
                        return;
                    }
                    setTimeout(handler, 100);
                });
        };

        setTimeout(handler, 100);
    });
}

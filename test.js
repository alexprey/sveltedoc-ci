import glob from 'glob';
import fs from 'fs';
import { performance  } from 'perf_hooks';

import { parse } from 'sveltedoc-parser';

const GLOB_FILTER = 'files/**/*.svelte';

const writeLog = console.log;

const ARROW_DOWN = {
    green: '/assets/down-arrow--green.png',
    yellow: '/assets/down-arrow--yellow.png',
    red: '/assets/down-arrow--red.png'
}

const ARROW_UP = {
    green: '/assets/up-arrow--green.png',
    yellow: '/assets/up-arrow--yellow.png',
    red: '/assets/up-arrow--red.png'
}

function renderStatsTable(artifacts) {
    let output = '';

    const appendLine = (line) => {
        output += `${line}\n`;
    };

    const compareTwoValues = (value, prevValue, formatFn, options) => {
        const opt = {
            ...{
                lowerIsBetter: false,
                deltaPercentThreshold: 0.01
            },
            ...options
        }

        const isBetterDelta = (delta) => {
            return opt.lowerIsBetter ? delta < 0.0 : delta > 0.0;
        }

        const isBaddestDelta = (delta) => {
            return opt.lowerIsBetter ? delta > 0.0 : delta < 0.0;
        }

        if (value !== undefined && prevValue !== undefined) {
            const delta = value - prevValue;

            if (Math.abs(delta) > 0.001 && Math.abs(delta / value) > opt.deltaPercentThreshold) {
                const color = isBetterDelta(delta) ? 'green' : 'red';

                if (delta < 0.0) {
                    return `${formatFn(value)} (![](${ARROW_DOWN[color]}) ${formatFn(delta)})`;
                }

                if (delta > 0.0) {
                    return `${formatFn(value)} (![](${ARROW_UP[color]}) +${formatFn(delta)})`;
                }
            }
        }

        return formatFn(value);
    };

    const formatPercent = value => {
        return `${(value * 100.0).toFixed(2)}%`;
    };

    const formatFloat = value => {
        return `${value.toFixed(2)}`;
    }

    // Render header
    appendLine('| Version | Error rate | Avg. Parse time (ms) | Avg. Speed (B/ms) |');
    appendLine('|---------|------------|--------------------------|---------------|');

    artifacts.forEach((artifact, index) => {
        const prevArtifact = index < artifacts.length - 1 
            ? artifacts[index + 1] 
            : null;

        const stats = artifact.stats;

        const errorRate = stats.errorsCount / stats.totalHandledFilesCount;
        const prevErrorRate = prevArtifact
            ? prevArtifact.stats.errorsCount / prevArtifact.stats.totalHandledFilesCount
            : undefined;

        const avgExecutionTimeInMs = stats.totalExecutionTimeInMs / stats.totalHandledFilesCount;

        const avgSpeed = stats.bytesHandled / stats.totalExecutionTimeInMs;
        const prevAvgSpeed = prevArtifact
            ? prevArtifact.stats.bytesHandled / prevArtifact.stats.totalExecutionTimeInMs
            : undefined;

        appendLine(
            `| [${artifact.packageVersion}](https://github.com/alexprey/sveltedoc-parser/releases/tag/${artifact.packageVersion}) ` + 
            `| ${compareTwoValues(errorRate, prevErrorRate, formatPercent, { lowerIsBetter: true })} ` +
            `| ${formatFloat(avgExecutionTimeInMs)} ` + 
            `| ${compareTwoValues(avgSpeed, prevAvgSpeed, formatFloat, { deltaPercentThreshold: 0.05 })} |`
        );
    });

    return output;
}

function handleTestStats(stats) {
    const svelteDocParserPackageConfig = JSON.parse(fs.readFileSync('node_modules/sveltedoc-parser/package.json'));

    const artifactOutput = {
        artifactVersion: 1,
        packageVersion: svelteDocParserPackageConfig.version,
        stats: stats
    };

    console.log(svelteDocParserPackageConfig.version);
    console.log(artifactOutput);

    glob('output/*.json', (e, prevArtifactPathList) => {
        const historyArtifacts = prevArtifactPathList.map(artifactPath => {
            return JSON.parse(fs.readFileSync(artifactPath));
        }).reduce((acc, artifact) => {
            acc[artifact.packageVersion] = artifact;
            return acc;
        }, {});

        historyArtifacts[artifactOutput.packageVersion] = artifactOutput;

        const statsTable = renderStatsTable(Object.values(historyArtifacts).reverse());
        console.log(statsTable);
        
        fs.writeFileSync('output/overview.md', statsTable);
    });

    fs.mkdirSync('output', { recursive: true });
    fs.writeFileSync(`output/${svelteDocParserPackageConfig.version}.json`, JSON.stringify(artifactOutput));
}

(async () => {
    let filesHandled = 0;
    let bytesHandled = 0;
    let totalExecutionTimeInMs = 0;
    let handledWithError = 0;
    let typeScriptFilesCount = 0;

    glob(GLOB_FILTER, async (e, files) => {
        let batch = [];
        for (let index = 0; index < files.length; index++) {
            const filePath = files[index];
            const fileContent = fs.readFileSync(filePath).toString();

            if (!fileContent.includes('lang=\"ts\"') && !fileContent.includes('lang\'ts\'')) {
                batch.push({
                    path: filePath,
                    content: fileContent
                });
            } else {
                typeScriptFilesCount++;
            }

            if (batch.length > 30 || index === files.length - 1) {
                const batchExecutionTimeStart = performance.now();

                const tasks = batch.map(async (item) => {
                    try {
                        const output = await parse({
                            fileContent: item.content,
                            version: 3,
                        });

                        if (!output) {
                            writeLog(`Failed [${item.path}] with message: Empty output`);
                            handledWithError++;
                        }
                    } catch(e) {
                        writeLog(`Failed [${item.path}] with message: (${e.name}) ${e.message}`);
                        handledWithError++;
                    }
                });

                await Promise.all(tasks);

                const batchExecutionTimeEnd = performance.now();
                const batchDuration = batchExecutionTimeEnd - batchExecutionTimeStart;
                const batchSize = batch.reduce((acc, item) => acc + item.content.length, 0);

                writeLog(`Batch handled with ${batch.length} files (${batchSize} B) within ${batchDuration} ms (Avg.: ${(batchDuration / batch.length).toFixed(3)} ms) with speed ${(batchSize / batchDuration).toFixed(3)} B/ms`);

                totalExecutionTimeInMs += batchDuration;
                bytesHandled += batchSize;
                filesHandled += batch.length;

                batch = [];
            }
        }

        writeLog(`Totally completed ${filesHandled} (of ${files.length}) and with ${handledWithError} errors (${(handledWithError / filesHandled * 100).toFixed(1)}%)!`);
        writeLog(`Typescript files found ${typeScriptFilesCount}`);
        writeLog(`All handled with ${filesHandled} files (${bytesHandled} B) within ${totalExecutionTimeInMs} ms (Avg.: ${(totalExecutionTimeInMs / filesHandled).toFixed(3)} ms) with speed ${(bytesHandled / totalExecutionTimeInMs).toFixed(3)}B/ms`);

        handleTestStats({
            totalFilesCount: files.length,
            totalTypeScriptFilesCount: typeScriptFilesCount,
            totalHandledFilesCount: filesHandled,
            errorsCount: handledWithError,
            totalExecutionTimeInMs: totalExecutionTimeInMs,
            bytesHandled: bytesHandled
        });
    });
})();
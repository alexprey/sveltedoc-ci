import { exec } from 'child_process';
import { execProcessAsync } from './execProc.js';

function run(cmd, isJson = false) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            }

            const output = isJson 
                ? JSON.parse(stdout) 
                : stdout;
 
            resolve([ output, stderr ]);
        });
    })
}

function delay(timeout) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), timeout);
    });
}

(async () => {
    const [ versions ] = await run('npm view sveltedoc-parser versions --json', true);
    const acceptableVersions = versions.filter(v => {
        const parts = v.split('.');
        const major = parseInt(parts[0]);
        const minor = parseInt(parts[1]);
        const patch = parseInt(parts[2]);

        return (!['3.0.2', '4.2.0', '4.2.1'].includes(v) 
            && ((major === 2 && minor === 3 && patch >= 4)
            || (major === 2 && minor > 3)
            || (major >= 3))
        );
    });

    console.log(acceptableVersions);

    for (let i = 0; i < acceptableVersions.length; i++) {
        const version = acceptableVersions[i];
        console.log(`Install package of version "${version}"`);

        await run(`yarn add --no-progress --exact --no-lockfile sveltedoc-parser@${version}`);
        console.log(`[${version}] Installed, wait for system cooling`);
        await delay(10000);
        console.log(`[${version}] Run tests`);

        try {
            await execProcessAsync('node', ['./test.js']);
        } catch (e) {
            console.error(e);
        }

        console.log(`[${version}] Tests are done!`);
    }
})().catch((reason) => {
    console.error(reason);
});
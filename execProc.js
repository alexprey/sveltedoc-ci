import { spawn } from 'child_process';

function wrapOutput(cmd, output) {
    return output.toString()
        .split(/\r\n|\n/)
        .filter((line, index) => line && line.length > 0)
        .map(line => `${cmd} > ${line}`)
        .join('\n');
}

export function execProcess(cmd, args) {
    console.log(`RUN: ${cmd} ${args ? args.join(' ') : ''}`);

    const childProcess = spawn(cmd, args, {
        env: {
            ...process.env
        }
    });
    
    childProcess.stdout.on('data', data => {
        console.log(wrapOutput(cmd, data));
    });
    
    childProcess.stderr.on('data', data => {
        console.error(wrapOutput(cmd, data));
    });
    
    childProcess.on('error', e => {
        console.error(`${cmd} error: [${e.name}] ${e.message}`, e);
    });
    
    childProcess.on('exit', code => {
        console.log(`${cmd} exit with code ${code}`);
    });

    return childProcess;
}

export function execProcessAsync(cmd, args) {
    return new Promise((resolve, reject) => {
        const process = execProcess(cmd, args);

        process.on('exit', (code) => {
            process.removeAllListeners();

            if (code === 0) {
                resolve(0);
                return;
            }

            const error = new Error(`Process exit with status code ${code}`);
            error.code = code;
            reject(error);
        });
    });
}
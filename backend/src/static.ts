import azure from "@azure/functions";
import mime from 'mime';
import { readFile } from 'node:fs/promises';

async function serveStaticFile(filename: string): Promise<azure.HttpResponseInit> {
    try {
        const file = await readFile(filename);

        return {
            body: file,
            headers: {
                'Cache-Control': 'public, max-age=3600',
                'Content-Type': mime.getType(filename) as string,
            },
        };
    }

    catch {
        return {
            status: 404,
            body: `Path not supported`,
        };
    }
}

function localhostHack(request: azure.HttpRequest): string {
    return request.headers.get('host')?.includes('localhost') ? '../' : '';
}

azure.app.get('z_static_hosting', {
    route: '{*filename}',
    handler: async (request: azure.HttpRequest): Promise<azure.HttpResponseInit> => {
        const filename = request.params.filename || 'index.html';

        return await serveStaticFile(localhostHack(request) + 'frontend/dist/' + filename);
    }
});

azure.app.get('legal', async (request: azure.HttpRequest): Promise<azure.HttpResponseInit> => {
    return await serveStaticFile(localhostHack(request) + 'frontend/dist/legal.md');
});

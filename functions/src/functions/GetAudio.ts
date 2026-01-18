import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as fs from "fs";
import * as path from "path";

/**
 * 音声ファイルを配信するHTTP関数
 * @param request - HTTPリクエスト
 * @param context - 実行コンテキスト
 * @returns 音声ファイルのHTTPレスポンス
 */
export async function GetAudio(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('GetAudio function processed a request');

    try {
        // mp3ファイルのパスを取得（publicフォルダから）
        const audioPath = path.join(__dirname, '../../public/message.mp3');
        
        context.log(`Reading audio file from: ${audioPath}`);
        
        // ファイルの存在確認
        if (!fs.existsSync(audioPath)) {
            context.log(`Audio file not found at: ${audioPath}`);
            return {
                status: 404,
                body: "Audio file not found"
            };
        }
        
        // ファイルを読み込み
        const audioBuffer = fs.readFileSync(audioPath);
        
        context.log(`Audio file loaded successfully. Size: ${audioBuffer.length} bytes`);
        
        // mp3ファイルとして返す
        return {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': audioBuffer.length.toString(),
                'Cache-Control': 'public, max-age=3600'
            },
            body: audioBuffer
        };
        
    } catch (error: any) {
        context.log(`Error serving audio file: ${error.message}`);
        return {
            status: 500,
            body: `Error: ${error.message}`
        };
    }
}

// Azure Functionsに登録
app.http('GetAudio', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: GetAudio
});

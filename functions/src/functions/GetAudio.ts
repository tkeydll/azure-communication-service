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
    context.log('GetAudioのリクエストを処理しました');

    try {
        // 電話再生向けWAVファイルのパスを取得（publicフォルダから）
        const audioPath = path.join(__dirname, '../../../public/message.wav');
        
        context.log(`音声ファイルを読み込みます: ${audioPath}`);
        
        // ファイルの存在確認
        if (!fs.existsSync(audioPath)) {
            context.log(`音声ファイルが見つかりません: ${audioPath}`);
            return {
                status: 404,
                body: "Audio file not found"
            };
        }
        
        // ファイルを読み込み
        const audioBuffer = fs.readFileSync(audioPath);
        
        context.log(`音声ファイルの読み込みに成功しました。サイズ: ${audioBuffer.length}バイト`);
        
        // ACSがサポートする16kHz・16bit PCM・モノラルWAVとして返す
        return {
            status: 200,
            headers: {
                'Content-Type': 'audio/wav',
                'Content-Length': audioBuffer.length.toString(),
                'Cache-Control': 'public, max-age=3600'
            },
            body: audioBuffer
        };
        
    } catch (error: any) {
        context.log(`音声ファイルの配信に失敗しました: ${error.message}`);
        return {
            status: 500,
            body: `Error: ${error.message}`
        };
    }
}

// Azure Functionsに登録
app.http('GetAudio', {
    methods: ['GET'],
    authLevel: 'function',
    handler: GetAudio
});

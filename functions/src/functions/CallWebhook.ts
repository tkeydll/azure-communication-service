// Azure Functions と Azure Communication Services の必要なモジュールをインポート
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { CallAutomationClient } from "@azure/communication-call-automation";
import { PhoneNumberIdentifier } from "@azure/communication-common";
import * as dotenv from "dotenv";

// 親ディレクトリの .env ファイルから環境変数を読み込む
dotenv.config({ path: '../.env' });

// 環境変数から Azure Communication Services の接続情報を取得
const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
const fromPhoneNumber = process.env.FROM_PHONE_NUMBER;

// 必須の環境変数が設定されているかチェック
if (!connectionString || !fromPhoneNumber) {
    throw new Error("Missing required environment variables");
}

// Call Automation クライアントを初期化
const callAutomationClient = new CallAutomationClient(connectionString);

/**
 * Azure Communication Services を使って PSTN 電話をかける HTTP トリガー関数
 * @param request - HTTP リクエスト（toPhoneNumber と audioUrl を含む JSON ボディを期待）
 * @param context - Azure Functions の実行コンテキスト
 * @returns 通話開始結果を含む HTTP レスポンス
 */
export async function CallWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        // リクエストボディから電話番号と音声ファイル URL を取得
        const body = await request.json() as { toPhoneNumber?: string; audioUrl?: string };
        const toPhoneNumber = body?.toPhoneNumber || process.env.TO_PHONE_NUMBER;
        // デフォルトの音声ファイル（mp3形式の日本語メッセージ）
        // ローカル: http://localhost:7071/api/GetAudio
        // 本番: https://acs-call-func-20250817.azurewebsites.net/api/GetAudio
        const defaultAudioUrl = process.env.AUDIO_FILE_URL || "https://acs-call-func-20250817.azurewebsites.net/api/GetAudio";
        const audioUrl = body?.audioUrl || defaultAudioUrl;

        // 発信先電話番号が指定されていない場合はエラーを返す
        if (!toPhoneNumber) {
            return {
                status: 400,
                jsonBody: { error: "toPhoneNumber is required" }
            };
        }

        context.log(`Making call from ${fromPhoneNumber} to ${toPhoneNumber} with audio: ${audioUrl}`);

        // コールバック URL を設定（通話イベントを受信するための公開 HTTPS エンドポイント）
        // 注: ローカル開発では動作しないため、Azure にデプロイして公開 URL を使用する必要がある
        const callbackUri = process.env.CALLBACK_URL || "https://your-app.azurewebsites.net/api/callback";
        
        // 発信先の電話番号を PhoneNumberIdentifier オブジェクトとして設定
        const target: PhoneNumberIdentifier = {
            phoneNumber: toPhoneNumber
        };
        
        // 発信元の電話番号を PhoneNumberIdentifier オブジェクトとして設定
        const source: PhoneNumberIdentifier = {
            phoneNumber: fromPhoneNumber
        };
        
        // Call Automation SDK で使用する通話招待オブジェクトを作成
        const callInvite = {
            targetParticipant: target,        // 発信先
            sourceCallIdNumber: source        // 発信元（発信者番号通知）
        };
        
        // Azure Communication Services API を呼び出して通話を開始
        const result = await callAutomationClient.createCall(
            callInvite,
            callbackUri
        );

        const callConnectionId = result.callConnectionProperties.callConnectionId;
        context.log(`Call created successfully. Call connection ID: ${callConnectionId}`);

        // CallConnection オブジェクトを取得
        const callConnection = callAutomationClient.getCallConnection(callConnectionId);
        
        // 電話がつながるまで待機（最大30秒、1秒ごとにチェック）
        let callEstablished = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                const properties = await callConnection.getCallConnectionProperties();
                context.log(`Call state: ${properties.callConnectionState}`);
                
                if (properties.callConnectionState === "connected") {
                    callEstablished = true;
                    context.log("Call established!");
                    break;
                }
            } catch (error) {
                context.log(`Error checking call state: ${error}`);
            }
        }
        
        if (!callEstablished) {
            context.log("Call did not establish in time");
            return {
                status: 200,
                jsonBody: {
                    success: false,
                    callConnectionId: callConnectionId,
                    from: fromPhoneNumber,
                    to: toPhoneNumber,
                    message: "Call initiated but not established yet"
                }
            };
        }
        
        // 音声ファイルを再生（Cognitive Services 不要！）
        // WAV ファイル（mono, 16KHz）を公開 URL から再生
        context.log(`Playing audio file: ${audioUrl}`);
        
        try {
            await callConnection.getCallMedia().playToAll([
                {
                    kind: "fileSource",
                    url: audioUrl
                }
            ]);
            
            context.log(`Audio playback initiated successfully`);
            
            // 音声が再生されるまで待機（10秒）
            // 注: 実際の再生完了はコールバックイベント（PlayCompleted）で確認すべきだが、
            // 簡易的に固定時間待機してから切断する
            context.log("Waiting for audio to play...");
            await new Promise(resolve => setTimeout(resolve, 10000));
            context.log("Audio playback completed, hanging up call...");
            
            // 通話を切断
            await callConnection.hangUp(true);
            context.log("Call disconnected successfully");
            
        } catch (playError: any) {
            context.log(`Error playing audio: ${playError.message}`);
            // エラーが発生した場合も通話を切断
            try {
                await callConnection.hangUp(true);
                context.log("Call disconnected after error");
            } catch (hangUpError: any) {
                context.log(`Error hanging up: ${hangUpError.message}`);
            }
            throw playError;
        }

        // 成功レスポンスを返す（通話接続 ID や電話番号情報を含む）
        return {
            status: 200,
            jsonBody: {
                success: true,
                callConnectionId: callConnectionId,
                from: fromPhoneNumber,
                to: toPhoneNumber,
                message: "Call initiated and audio playback started",
                audioUrl: audioUrl
            }
        };

    } catch (error: any) {
        // エラーが発生した場合はログに記録し、エラーレスポンスを返す
        context.log(`Error making call: ${error.message}`);
        return {
            status: 500,
            jsonBody: {
                error: "Failed to make call",
                details: error.message
            }
        };
    }
};

// Azure Functions の HTTP トリガーとして登録
// - エンドポイント: /api/CallWebhook
// - メソッド: GET, POST
// - 認証: なし（anonymous）
app.http('CallWebhook', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: CallWebhook
});

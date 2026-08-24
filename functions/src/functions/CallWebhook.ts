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

if (!connectionString || !fromPhoneNumber) {
    throw new Error("Missing required environment variables");
}

// Call Automation クライアントを初期化
const callAutomationClient = new CallAutomationClient(connectionString);

type CallRequestBody = { toPhoneNumber?: string; audioUrl?: string };

function isE164PhoneNumber(value: string): boolean {
    return /^\+[1-9]\d{6,14}$/.test(value);
}

function isHttpsUrl(value: string): boolean {
    try {
        return new URL(value).protocol === "https:";
    } catch {
        return false;
    }
}

function getCallbackUrl(): string | undefined {
    if (process.env.CALLBACK_URL) {
        return process.env.CALLBACK_URL;
    }

    const hostname = process.env.WEBSITE_HOSTNAME;
    const callbackFunctionKey = process.env.CALLBACK_FUNCTION_KEY;
    if (!hostname || !callbackFunctionKey) {
        return undefined;
    }

    return `https://${hostname}/api/CallEvents?code=${encodeURIComponent(callbackFunctionKey)}`;
}

function getAudioUrl(): string | undefined {
    if (process.env.AUDIO_FILE_URL) {
        return process.env.AUDIO_FILE_URL;
    }

    const hostname = process.env.WEBSITE_HOSTNAME;
    const functionKey = process.env.GETAUDIO_FUNCTION_KEY;
    if (!hostname || !functionKey) {
        return undefined;
    }

    return `https://${hostname}/api/GetAudio?code=${encodeURIComponent(functionKey)}`;
}

function getErrorStatus(error: unknown): number {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    return statusCode === 429 || statusCode === 408 || (statusCode !== undefined && statusCode >= 500)
        ? 503
        : 500;
}

export async function CallWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`CallWebhookを開始しました。Invocation ID: ${context.invocationId}`);

    try {
        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
            return { status: 415, jsonBody: { error: "Content-Type must be application/json" } };
        }

        let body: CallRequestBody;
        try {
            body = await request.json() as CallRequestBody;
        } catch {
            return { status: 400, jsonBody: { error: "Request body must be valid JSON" } };
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return { status: 400, jsonBody: { error: "Request body must be a JSON object" } };
        }

        const toPhoneNumber = body.toPhoneNumber || process.env.TO_PHONE_NUMBER;
        if (!toPhoneNumber) {
            return { status: 400, jsonBody: { error: "toPhoneNumber is required" } };
        }
        if (!isE164PhoneNumber(toPhoneNumber)) {
            return { status: 400, jsonBody: { error: "toPhoneNumber must be an E.164 phone number" } };
        }

        const audioUrl = body.audioUrl || getAudioUrl();
        if (!audioUrl || !isHttpsUrl(audioUrl)) {
            context.warn("音声URLが未設定、またはHTTPSではありません");
            return { status: 503, jsonBody: { error: "Audio URL is not configured" } };
        }

        const callbackUri = getCallbackUrl();
        if (!callbackUri || !isHttpsUrl(callbackUri)) {
            context.error("コールバックURLが未設定、またはHTTPSではありません");
            return { status: 503, jsonBody: { error: "Callback URL is not configured" } };
        }

        const target: PhoneNumberIdentifier = {
            phoneNumber: toPhoneNumber
        };
        const source: PhoneNumberIdentifier = {
            phoneNumber: fromPhoneNumber
        };
        const callInvite = {
            targetParticipant: target,
            sourceCallIdNumber: source
        };

        context.log(`発信を開始します。発信元: ${fromPhoneNumber}、発信先: ${toPhoneNumber}`);
        const result = await callAutomationClient.createCall(callInvite, callbackUri, {
            operationContext: `call-${context.invocationId}`
        });
        const callConnectionId = result.callConnectionProperties.callConnectionId;
        context.log(`発信を受け付けました。Call connection ID: ${callConnectionId}`);
        return {
            status: 202,
            jsonBody: {
                status: "accepted",
                callConnectionId,
                from: fromPhoneNumber,
                to: toPhoneNumber,
                message: "Call initiated; playback will be controlled by callback events"
            }
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        context.error(`通話の作成に失敗しました: ${message}`);
        return {
            status: getErrorStatus(error),
            jsonBody: { error: "Failed to initiate call" }
        };
    }
}

// Azure Functions の HTTP トリガーとして登録
// - エンドポイント: /api/CallWebhook
// - メソッド: POST
// - 認証: Function キー必須
app.http('CallWebhook', {
    methods: ['POST'],
    authLevel: 'function',
    handler: CallWebhook
});

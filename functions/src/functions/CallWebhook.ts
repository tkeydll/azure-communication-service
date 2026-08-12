// Azure Functions と Azure Communication Services の必要なモジュールをインポート
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { CallAutomationClient } from "@azure/communication-call-automation";
import { PhoneNumberIdentifier } from "@azure/communication-common";
import * as dotenv from "dotenv";

dotenv.config({ path: '../.env' });

function getCallAutomationClient(): CallAutomationClient {
    const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error("Missing required environment variable: COMMUNICATION_SERVICES_CONNECTION_STRING");
    }
    return new CallAutomationClient(connectionString);
}

function getCallbackUri(audioUrl: string): string {
    let callbackUri: string;
    if (process.env.CALLBACK_URL) {
        callbackUri = process.env.CALLBACK_URL;
    } else {
        const hostname = process.env.WEBSITE_HOSTNAME;
        const callbackFunctionKey = process.env.CALLBACK_FUNCTION_KEY;
        if (!hostname || !callbackFunctionKey) {
            throw new Error("CALLBACK_URL or WEBSITE_HOSTNAME and CALLBACK_FUNCTION_KEY must be configured");
        }

        callbackUri = `https://${hostname}/api/CallEvents?code=${encodeURIComponent(callbackFunctionKey)}`;
    }

    const callbackUrl = new URL(callbackUri);
    if (!callbackUrl.searchParams.has('code')) {
        const callbackFunctionKey = process.env.CALLBACK_FUNCTION_KEY;
        if (!callbackFunctionKey) {
            throw new Error("CALLBACK_FUNCTION_KEY must be configured when CALLBACK_URL does not include a function code");
        }
        callbackUrl.searchParams.set('code', callbackFunctionKey);
    }
    callbackUrl.searchParams.set('audioUrl', audioUrl);
    return callbackUrl.toString();
}

function getDefaultAudioUrl(): string | undefined {
    const hostname = process.env.WEBSITE_HOSTNAME;
    const getAudioFunctionKey = process.env.GETAUDIO_FUNCTION_KEY;
    if (hostname && getAudioFunctionKey) {
        return `https://${hostname}/api/GetAudio?code=${encodeURIComponent(getAudioFunctionKey)}`;
    }

    return process.env.AUDIO_FILE_URL;
}

/** 発信だけを開始し、通話制御は CallEvents callback に委譲する。 */
export async function CallWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const fromPhoneNumber = process.env.FROM_PHONE_NUMBER;
        if (!fromPhoneNumber) {
            return { status: 500, jsonBody: { error: "FROM_PHONE_NUMBER is not configured" } };
        }

        const body = await request.json() as { toPhoneNumber?: string; audioUrl?: string };
        const toPhoneNumber = body?.toPhoneNumber || process.env.TO_PHONE_NUMBER;
        const audioUrl = body?.audioUrl || getDefaultAudioUrl();

        if (!toPhoneNumber) {
            return { status: 400, jsonBody: { error: "toPhoneNumber is required" } };
        }
        if (!audioUrl) {
            return { status: 500, jsonBody: { error: "An audio URL is not configured" } };
        }

        const callbackUri = getCallbackUri(audioUrl);
        context.log(`Making call from ${fromPhoneNumber} to ${toPhoneNumber} with audio: ${audioUrl}`);

        const callInvite = {
            targetParticipant: { phoneNumber: toPhoneNumber } as PhoneNumberIdentifier,
            sourceCallIdNumber: { phoneNumber: fromPhoneNumber } as PhoneNumberIdentifier
        };
        const result = await getCallAutomationClient().createCall(callInvite, callbackUri);
        const callConnectionId = result.callConnectionProperties.callConnectionId;

        context.log(`Call created successfully. Call connection ID: ${callConnectionId}`);

        return {
            status: 202,
            jsonBody: {
                success: true,
                callConnectionId,
                from: fromPhoneNumber,
                to: toPhoneNumber,
                audioUrl,
                message: "Call initiated; playback will be controlled by CallEvents"
            }
        };
    } catch (error: any) {
        context.log(`Error making call: ${error.message}`);
        return {
            status: 500,
            jsonBody: { error: "Failed to make call", details: error.message }
        };
    }
}

app.http('CallWebhook', {
    methods: ['POST'],
    authLevel: 'function',
    handler: CallWebhook
});

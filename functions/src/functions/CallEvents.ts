import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { CallAutomationClient } from "@azure/communication-call-automation";
import * as dotenv from "dotenv";

dotenv.config({ path: '../.env' });

const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
if (!connectionString) {
    throw new Error("Missing required environment variable: COMMUNICATION_SERVICES_CONNECTION_STRING");
}

const callAutomationClient = new CallAutomationClient(connectionString);

type CallAutomationEvent = {
    type?: string;
    data?: {
        callConnectionId?: string;
        operationContext?: string;
        resultInformation?: unknown;
        [key: string]: unknown;
    };
};

function getAudioUrl(request: HttpRequest): string | undefined {
    const callbackAudioUrl = new URL(request.url).searchParams.get("audioUrl");
    if (callbackAudioUrl) {
        return callbackAudioUrl;
    }

    const hostname = process.env.WEBSITE_HOSTNAME;
    const getAudioFunctionKey = process.env.GETAUDIO_FUNCTION_KEY;
    if (hostname && getAudioFunctionKey) {
        return `https://${hostname}/api/GetAudio?code=${encodeURIComponent(getAudioFunctionKey)}`;
    }

    return process.env.AUDIO_FILE_URL;
}

function getEvents(payload: unknown): CallAutomationEvent[] {
    if (Array.isArray(payload)) {
        return payload as CallAutomationEvent[];
    }
    return [payload as CallAutomationEvent];
}

function isCallNotFound(error: any): boolean {
    return typeof error?.message === "string" && error.message.toLowerCase().includes("call not found");
}

async function hangUpIfConnected(callConnectionId: string, context: InvocationContext): Promise<void> {
    try {
        await callAutomationClient.getCallConnection(callConnectionId).hangUp(true);
        context.log(`Call disconnected successfully. Call connection ID: ${callConnectionId}`);
    } catch (error: any) {
        if (isCallNotFound(error)) {
            // The caller may have disconnected already. This is an idempotent terminal state.
            context.log(`Call already disconnected. Call connection ID: ${callConnectionId}`);
            return;
        }
        throw error;
    }
}

async function handleEvent(event: CallAutomationEvent, request: HttpRequest, context: InvocationContext): Promise<void> {
    const eventType = event.type;
    const eventData = event.data || {};
    const callConnectionId = eventData.callConnectionId;

    context.log(`Call Automation event received: ${eventType}, callConnectionId: ${callConnectionId || "unknown"}`);

    if (!callConnectionId) {
        context.log(`Ignoring event without callConnectionId: ${eventType}`);
        return;
    }

    const callConnection = callAutomationClient.getCallConnection(callConnectionId);

    switch (eventType) {
        case "Microsoft.Communication.CallConnected": {
            const audioUrl = getAudioUrl(request);
            if (!audioUrl) {
                throw new Error("An audio URL is not configured");
            }

            context.log(`Call connected; starting audio playback: ${audioUrl}`);
            await callConnection.getCallMedia().playToAll([
                { kind: "fileSource", url: audioUrl }
            ]);
            context.log(`Audio playback initiated successfully. Call connection ID: ${callConnectionId}`);
            return;
        }

        case "Microsoft.Communication.PlayCompleted":
            context.log(`Audio playback completed; hanging up. Operation context: ${eventData.operationContext || "none"}`);
            await hangUpIfConnected(callConnectionId, context);
            return;

        case "Microsoft.Communication.PlayFailed":
            context.log(`Audio playback failed: ${JSON.stringify(eventData.resultInformation)}`);
            await hangUpIfConnected(callConnectionId, context);
            return;

        case "Microsoft.Communication.CallDisconnected":
            context.log(`Call disconnected by remote party or service. Call connection ID: ${callConnectionId}`);
            return;

        default:
            context.log(`Ignoring unsupported Call Automation event: ${eventType}`);
    }
}

/** ACS Call Automation のイベントを受け取り、通話の状態に応じて処理する。 */
export async function CallEvents(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const payload = await request.json();
        for (const event of getEvents(payload)) {
            await handleEvent(event, request, context);
        }

        return { status: 200, jsonBody: { received: true } };
    } catch (error: any) {
        context.log(`Error processing Call Automation event: ${error.message}`);
        return { status: 500, jsonBody: { error: "Failed to process Call Automation event", details: error.message } };
    }
}

app.http('CallEvents', {
    methods: ['POST'],
    authLevel: 'function',
    handler: CallEvents
});
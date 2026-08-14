import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
    CallAutomationClient,
    CallAutomationEvent,
    parseCallAutomationEvent
} from "@azure/communication-call-automation";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
const audioUrl = process.env.AUDIO_FILE_URL || buildAudioUrl();

if (!connectionString) {
    throw new Error("Missing required environment variable: COMMUNICATION_SERVICES_CONNECTION_STRING");
}

const callAutomationClient = new CallAutomationClient(connectionString);

function buildAudioUrl(): string | undefined {
    const hostname = process.env.WEBSITE_HOSTNAME;
    const functionKey = process.env.GETAUDIO_FUNCTION_KEY;
    return hostname && functionKey
        ? `https://${hostname}/api/GetAudio?code=${encodeURIComponent(functionKey)}`
        : undefined;
}

function getEventBodies(body: unknown): Record<string, unknown>[] {
    if (Array.isArray(body)) {
        const events = body.filter((event): event is Record<string, unknown> =>
            Boolean(event && typeof event === "object" && !Array.isArray(event))
        );
        if (events.length === body.length && events.length > 0) {
            return events;
        }
    }

    if (body && typeof body === "object") {
        return [body as Record<string, unknown>];
    }

    throw new Error("Callback body must be a JSON object or event array");
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown error";
}

function isAlreadyEndedError(error: unknown): boolean {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("call not found") || message.includes("already ended");
}

async function hangUpIfActive(callConnectionId: string, context: InvocationContext): Promise<void> {
    try {
        await callAutomationClient.getCallConnection(callConnectionId).hangUp(true);
        context.log(`Call disconnected. Call connection ID: ${callConnectionId}`);
    } catch (error) {
        if (isAlreadyEndedError(error)) {
            context.log(`Call already ended. Call connection ID: ${callConnectionId}`);
            return;
        }
        throw error;
    }
}

async function handleEvent(event: CallAutomationEvent, context: InvocationContext): Promise<void> {
    const callConnectionId = event.callConnectionId;
    context.log(`Received ACS event ${event.kind}. Call connection ID: ${callConnectionId}`);

    switch (event.kind) {
        case "CallConnected":
            if (!audioUrl) {
                throw new Error("Missing required audio URL configuration");
            }
            await callAutomationClient.getCallConnection(callConnectionId).getCallMedia().playToAll(
                [{ kind: "fileSource", url: audioUrl }],
                { operationContext: "welcome-audio", interruptCallMediaOperation: true }
            );
            context.log(`Audio playback initiated. Call connection ID: ${callConnectionId}`);
            return;

        case "PlayCompleted":
            context.log(`Audio playback completed. Call connection ID: ${callConnectionId}`);
            await hangUpIfActive(callConnectionId, context);
            return;

        case "PlayFailed":
        case "PlayCanceled":
            context.warn(`Audio playback did not complete: ${event.kind}. Call connection ID: ${callConnectionId}`);
            await hangUpIfActive(callConnectionId, context);
            return;

        case "CallDisconnected":
            context.log(`Call disconnected by remote party. Call connection ID: ${callConnectionId}`);
            return;

        case "CreateCallFailed":
        case "ConnectFailed":
        case "AnswerFailed":
            context.error(`ACS call operation failed: ${event.kind}. Call connection ID: ${callConnectionId}`);
            return;

        default:
            context.log(`Ignoring unsupported ACS event: ${event.kind}`);
    }
}

export async function CallEvents(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    let eventBodies: Record<string, unknown>[];
    try {
        eventBodies = getEventBodies(await request.json());
    } catch (error) {
        const message = getErrorMessage(error);
        context.error(`Call event processing failed: ${message}`);
        return { status: 400, jsonBody: { error: "Invalid callback event" } };
    }

    try {
        for (const eventBody of eventBodies) {
            await handleEvent(parseCallAutomationEvent(eventBody), context);
        }
        return { status: 200, jsonBody: { received: true } };
    } catch (error) {
        const message = getErrorMessage(error);
        context.error(`Call event action failed: ${message}`);
        return { status: 500, jsonBody: { error: "Failed to process callback event" } };
    }
}

app.http("CallEvents", {
    methods: ["POST"],
    authLevel: "function",
    handler: CallEvents
});
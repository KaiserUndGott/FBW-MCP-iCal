#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface CalendarInfo {
  name: string;
  id: string;
}

interface EventInfo {
  id: string;
  summary: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  calendar: string;
  isAllDay: boolean;
}

async function runAppleScript(script: string): Promise<string> {
  // Ensure Calendar app is running
  const launchScript = `
    tell application "Calendar"
      launch
    end tell
    delay 0.5
    ${script}
  `;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", launchScript], {
      timeout: 30000,
    });
    return stdout.trim();
  } catch (error: unknown) {
    const execError = error as { stderr?: string; message?: string };
    throw new McpError(
      ErrorCode.InternalError,
      execError.stderr || execError.message || "AppleScript error"
    );
  }
}

async function listCalendars(): Promise<CalendarInfo[]> {
  const script = `
    tell application "Calendar"
      set calNames to name of calendars
      set AppleScript's text item delimiters to "~~~"
      return calNames as text
    end tell
  `;

  const result = await runAppleScript(script);
  if (!result) return [];

  return result.split("~~~").map((name, index) => {
    return { name: name.trim(), id: String(index) };
  });
}

async function listEvents(
  startDate: string,
  endDate: string,
  calendarName?: string
): Promise<EventInfo[]> {
  const calendarPart = calendarName
    ? `set cals to {calendar "${calendarName}"}`
    : `set cals to calendars`;

  const script = `
    tell application "Calendar"
      set startD to date "${formatDateForAppleScript(startDate)}"
      set endD to date "${formatDateForAppleScript(endDate)}"
      set eventList to {}
      ${calendarPart}

      repeat with c in cals
        try
          set calEvents to (every event of c whose start date >= startD and start date <= endD)
          repeat with e in calEvents
            set eventSummary to summary of e
            set eventStart to start date of e
            set eventEnd to end date of e
            set eventAllDay to allday event of e
            set calName to name of c
            set eventLoc to ""
            try
              set eventLoc to location of e
            on error
              set eventLoc to ""
            end try

            set eventInfo to eventSummary & "|||" & (eventStart as string) & "|||" & (eventEnd as string) & "|||" & eventLoc & "|||" & calName & "|||" & eventAllDay
            set end of eventList to eventInfo
          end repeat
        end try
      end repeat

      set AppleScript's text item delimiters to "~~~"
      return eventList as text
    end tell
  `;

  const result = await runAppleScript(script);
  if (!result) return [];

  return result.split("~~~").map((item, index) => {
    const parts = item.split("|||");
    return {
      id: String(index),
      summary: parts[0] || "",
      startDate: parts[1] || "",
      endDate: parts[2] || "",
      location: parts[3] || "",
      description: "",
      calendar: parts[4] || "",
      isAllDay: parts[5] === "true",
    };
  });
}

async function createEvent(
  title: string,
  startDate: string,
  endDate: string,
  calendarName?: string,
  location?: string,
  description?: string,
  isAllDay?: boolean,
  alarms?: number[]
): Promise<string> {
  const targetCalendar = calendarName || "Kalender";
  const locationProp = location ? `, location:"${escapeForAppleScript(location)}"` : "";
  const descProp = description ? `, description:"${escapeForAppleScript(description)}"` : "";
  const allDayProp = isAllDay ? ", allday event:true" : "";

  // Build alarm creation commands if alarms are specified
  let alarmCommands = "";
  if (alarms && alarms.length > 0) {
    const alarmStatements = alarms.map(minutes =>
      `make new display alarm at end of display alarms of newEvent with properties {trigger interval:${minutes}}`
    ).join("\n        ");
    alarmCommands = `
        ${alarmStatements}`;
  }

  const script = `
    tell application "Calendar"
      tell calendar "${escapeForAppleScript(targetCalendar)}"
        set newEvent to make new event with properties {summary:"${escapeForAppleScript(title)}", start date:date "${formatDateForAppleScript(startDate)}", end date:date "${formatDateForAppleScript(endDate)}"${allDayProp}${locationProp}${descProp}}${alarmCommands}
        return "created"
      end tell
    end tell
  `;

  await runAppleScript(script);
  return title; // Return title as identifier since uid is not accessible
}

async function updateEvent(
  eventSummary: string,
  calendarName: string,
  newTitle?: string,
  startDate?: string,
  endDate?: string,
  location?: string,
  description?: string
): Promise<void> {
  let setProperties: string[] = [];

  if (newTitle) setProperties.push(`set summary of targetEvent to "${escapeForAppleScript(newTitle)}"`);
  if (startDate) setProperties.push(`set start date of targetEvent to date "${formatDateForAppleScript(startDate)}"`);
  if (endDate) setProperties.push(`set end date of targetEvent to date "${formatDateForAppleScript(endDate)}"`);
  if (location !== undefined) setProperties.push(`set location of targetEvent to "${escapeForAppleScript(location)}"`);
  if (description !== undefined) setProperties.push(`set description of targetEvent to "${escapeForAppleScript(description)}"`);

  if (setProperties.length === 0) return;

  const script = `
    tell application "Calendar"
      tell calendar "${escapeForAppleScript(calendarName)}"
        set targetEvent to (first event whose summary is "${escapeForAppleScript(eventSummary)}")
        ${setProperties.join("\n        ")}
        return "success"
      end tell
    end tell
  `;

  await runAppleScript(script);
}

async function deleteEvent(eventSummary: string, calendarName: string): Promise<void> {
  const script = `
    tell application "Calendar"
      tell calendar "${escapeForAppleScript(calendarName)}"
        set targetEvent to (first event whose summary is "${escapeForAppleScript(eventSummary)}")
        delete targetEvent
        return "success"
      end tell
    end tell
  `;

  await runAppleScript(script);
}

function formatDateForAppleScript(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes();

  // Format: "1. Januar 2024 10:00:00" (German locale) or similar
  // AppleScript uses system locale, so we use a universal format
  return `${day}/${month}/${year} ${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;
}

function escapeForAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Create the MCP server
const server = new Server(
  {
    name: "icloud-calendar-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_calendars",
        description:
          "List all available calendars including iCloud, local, and subscribed calendars.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "list_events",
        description:
          "List calendar events within a date range. Can filter by specific calendar.",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description:
                "Start date in ISO8601 format (e.g., 2024-01-15T00:00:00Z)",
            },
            endDate: {
              type: "string",
              description:
                "End date in ISO8601 format (e.g., 2024-01-31T23:59:59Z)",
            },
            calendarName: {
              type: "string",
              description:
                "Optional: Filter events by calendar name. If not provided, returns events from all calendars.",
            },
          },
          required: ["startDate", "endDate"],
        },
      },
      {
        name: "create_event",
        description:
          "Create a new calendar event. Specify title, start/end dates, and optionally calendar, location, and description.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Event title",
            },
            startDate: {
              type: "string",
              description:
                "Start date in ISO8601 format (e.g., 2024-01-15T10:00:00Z)",
            },
            endDate: {
              type: "string",
              description:
                "End date in ISO8601 format (e.g., 2024-01-15T11:00:00Z)",
            },
            calendarName: {
              type: "string",
              description:
                "Optional: Calendar name to create event in. Uses default calendar if not specified.",
            },
            isAllDay: {
              type: "boolean",
              description: "Optional: Whether this is an all-day event",
            },
            location: {
              type: "string",
              description: "Optional: Event location",
            },
            description: {
              type: "string",
              description: "Optional: Event description",
            },
            alarms: {
              type: "array",
              items: {
                type: "number",
              },
              description:
                "Optional: Array of alarm times in minutes before the event. Negative values for before event (e.g., -15 for 15 minutes before, -60 for 1 hour before). Use -1440 for 1 day before.",
            },
          },
          required: ["title", "startDate", "endDate"],
        },
      },
      {
        name: "update_event",
        description:
          "Update an existing calendar event by its summary/title and calendar name. Only specified fields will be updated.",
        inputSchema: {
          type: "object",
          properties: {
            eventSummary: {
              type: "string",
              description: "The current event title/summary to find",
            },
            calendarName: {
              type: "string",
              description: "The calendar name where the event is located",
            },
            newTitle: {
              type: "string",
              description: "Optional: New event title",
            },
            startDate: {
              type: "string",
              description: "Optional: New start date in ISO8601 format",
            },
            endDate: {
              type: "string",
              description: "Optional: New end date in ISO8601 format",
            },
            location: {
              type: "string",
              description: "Optional: New event location",
            },
            description: {
              type: "string",
              description: "Optional: New event description",
            },
          },
          required: ["eventSummary", "calendarName"],
        },
      },
      {
        name: "delete_event",
        description: "Delete a calendar event by its summary/title and calendar name.",
        inputSchema: {
          type: "object",
          properties: {
            eventSummary: {
              type: "string",
              description: "The event title/summary to delete",
            },
            calendarName: {
              type: "string",
              description: "The calendar name where the event is located",
            },
          },
          required: ["eventSummary", "calendarName"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_calendars": {
        const calendars = await listCalendars();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(calendars, null, 2),
            },
          ],
        };
      }

      case "list_events": {
        const { startDate, endDate, calendarName } = args as {
          startDate: string;
          endDate: string;
          calendarName?: string;
        };

        const events = await listEvents(startDate, endDate, calendarName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(events, null, 2),
            },
          ],
        };
      }

      case "create_event": {
        const { title, startDate, endDate, calendarName, location, description, isAllDay, alarms } =
          args as {
            title: string;
            startDate: string;
            endDate: string;
            calendarName?: string;
            location?: string;
            description?: string;
            isAllDay?: boolean;
            alarms?: number[];
          };

        const eventId = await createEvent(
          title,
          startDate,
          endDate,
          calendarName,
          location,
          description,
          isAllDay,
          alarms
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { success: true, message: "Event created", eventId },
                null,
                2
              ),
            },
          ],
        };
      }

      case "update_event": {
        const { eventSummary, calendarName, newTitle, startDate, endDate, location, description } =
          args as {
            eventSummary: string;
            calendarName: string;
            newTitle?: string;
            startDate?: string;
            endDate?: string;
            location?: string;
            description?: string;
          };

        await updateEvent(eventSummary, calendarName, newTitle, startDate, endDate, location, description);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { success: true, message: "Event updated", eventSummary },
                null,
                2
              ),
            },
          ],
        };
      }

      case "delete_event": {
        const { eventSummary, calendarName } = args as { eventSummary: string; calendarName: string };

        await deleteEvent(eventSummary, calendarName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { success: true, message: "Event deleted", eventSummary },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new McpError(ErrorCode.InternalError, errorMessage);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("iCloud Calendar MCP Server running on stdio (AppleScript mode)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

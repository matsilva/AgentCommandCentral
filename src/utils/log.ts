import os from "node:os";
import pino from "pino";
import type PinoPretty from "pino-pretty";
import pinoPretty from "pino-pretty";

const customPrettifiers: NonNullable<
	PinoPretty.PrettyOptions["customPrettifiers"]
> = {
	time: (timestamp) => `🕰 ${timestamp}`,
	level: (logLevel, _key, _log, extras) =>
		`LEVEL: ${logLevel} LABEL: ${extras.label} COLORIZED LABEL: ${extras.labelColorized}`,
	hostname: (hostname) => `MY HOST: ${hostname}`,
	pid: (pid) => String(pid),
	name: (name, _key, _log, extras) => extras.colors.blue(String(name)),
	caller: (caller, _key, _log, extras) =>
		extras.colors.greenBright(String(caller)),
	myCustomLogProp: (value, _key, _log, extras) =>
		`My Prop -> ${extras.colors.bold(String(value))} <--`,
};

const prettyStream = pinoPretty({
	colorize: true,
	translateTime: "SYS:standard",
	customPrettifiers,
});

export const rootLogger = pino(
	{
		name: "acc",
		level: process.env.ACC_LOG_LEVEL ?? "info",
		base: {
			pid: process.pid,
			hostname: os.hostname(),
		},
	},
	prettyStream,
);

export type Log = typeof rootLogger;

export function createLogger(bindings: pino.Bindings = {}) {
	return rootLogger.child(bindings);
}

export function getLogLevelName(level: number): string {
	return (
		Object.entries(pino.levels.values).find(
			([, value]) => value === level,
		)?.[0] ?? "unknown"
	);
}

export default rootLogger;

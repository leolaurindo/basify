import type {
	ConflictModeValue,
	LongFilenameMode,
	RepeatedFieldMode,
} from './convert';

export const MAX_FILE_MEMORIES = 25;

export interface BasifyMemory {
	lastFolder: string;
	lastBaseFolder: string;
	lastColumns: string[];
	lastNameColumn: number;
	lastStatusField: string;
	lastMode: 'file' | 'codeblock' | 'none';
	lastEmbedBase: boolean;
	lastExtractTags: boolean;
	lastExtractDates: boolean;
	lastExtractDynamic: boolean;
	lastNameSeparator: 'space' | 'dash' | 'underscore';
	lastFileNameField: string;
	lastFileNameFieldSeparator: 'space' | 'dash' | 'underscore';
	lastLowercaseNames: boolean;
	lastLowercaseNameField: boolean;
	lastLowercaseYamlFields: boolean;
	lastSourceMode: 'keep' | 'converted' | 'all';
	lastConflictMode: ConflictModeValue;
	lastConflictSuffix: string;
	lastRepeatedFieldMode: RepeatedFieldMode;
	lastLongFilenameMode: LongFilenameMode;
	lastMaxFilenameLength: number;
	lastAdvancedOptions: boolean;
}

export type BasifyFileMemories = Record<string, BasifyMemory>;

export const DEFAULT_MEMORY: BasifyMemory = {
	lastFolder: '',
	lastBaseFolder: '',
	lastColumns: [],
	lastNameColumn: 0,
	lastStatusField: 'status',
	lastMode: 'file',
	lastEmbedBase: false,
	lastExtractTags: true,
	lastExtractDates: true,
	lastExtractDynamic: false,
	lastNameSeparator: 'space',
	lastFileNameField: '',
	lastFileNameFieldSeparator: 'space',
	lastLowercaseNames: false,
	lastLowercaseNameField: false,
	lastLowercaseYamlFields: false,
	lastSourceMode: 'converted',
	lastConflictMode: 'skip',
	lastConflictSuffix: 'copy',
	lastRepeatedFieldMode: 'list',
	lastLongFilenameMode: 'shorten',
	lastMaxFilenameLength: 120,
	lastAdvancedOptions: false,
};

export function loadFileMemories(value: unknown): BasifyFileMemories {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	const memories: BasifyFileMemories = {};
	for (const [path, memory] of Object.entries(value as Record<string, unknown>)) {
		if (memory === null || typeof memory !== 'object' || Array.isArray(memory)) {
			continue;
		}
		memories[path] = { ...DEFAULT_MEMORY, ...memory };
	}
	return limitFileMemories(memories);
}

export function saveFileMemory(
	memories: BasifyFileMemories,
	path: string,
	memory: BasifyMemory,
): BasifyFileMemories {
	const next = { ...memories };
	delete next[path];
	next[path] = memory;
	return limitFileMemories(next);
}

export function renameFileMemory(
	memories: BasifyFileMemories,
	oldPath: string,
	newPath: string,
): BasifyFileMemories {
	const memory = memories[oldPath];
	if (memory === undefined) {
		return memories;
	}
	const next = { ...memories };
	delete next[oldPath];
	delete next[newPath];
	next[newPath] = memory;
	return next;
}

export function removeFileMemory(
	memories: BasifyFileMemories,
	path: string,
): BasifyFileMemories {
	if (memories[path] === undefined) {
		return memories;
	}
	const next = { ...memories };
	delete next[path];
	return next;
}

function limitFileMemories(memories: BasifyFileMemories): BasifyFileMemories {
	const paths = Object.keys(memories);
	if (paths.length <= MAX_FILE_MEMORIES) {
		return memories;
	}
	const limited: BasifyFileMemories = {};
	for (const path of paths.slice(-MAX_FILE_MEMORIES)) {
		limited[path] = memories[path] as BasifyMemory;
	}
	return limited;
}

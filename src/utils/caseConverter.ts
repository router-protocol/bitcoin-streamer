type JsonValue = string | number | boolean | { [key: string]: JsonValue } | JsonValue[];

function camelToSnake(str: string): string {
    return str.replace(/[\w]([A-Z])/g, (m) => {
        return m[0] + "_" + m[1];
    }).toLowerCase();
}

function isObject(value: any): value is { [key: string]: JsonValue } {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function keysToSnakeCase(obj: JsonValue): JsonValue {
    if (isObject(obj)) {
        const n: { [key: string]: JsonValue } = {};
        Object.keys(obj).forEach((k) => {
            n[camelToSnake(k)] = keysToSnakeCase((obj as { [key: string]: JsonValue })[k]);
        });
        return n;
    } else if (Array.isArray(obj)) {
        return obj.map((i) => keysToSnakeCase(i));
    }
    return obj;
}

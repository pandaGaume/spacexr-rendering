import type {
    IMetadataClassProperty,
    IMetadataEnum,
    IMetadataOffsetType,
    IMetadataPropertyTable,
    IMetadataPropertyTableProperty,
    IMetadataSchema,
    MetadataComponentType,
    MetadataValue,
} from "./ext-structural-metadata.types";

/** Reads the bytes of a buffer view of the asset, by its index. */
export type BufferViewReader = (index: number) => Promise<Uint8Array>;

const COMPONENT_BYTES: Readonly<Record<MetadataComponentType, number>> = {
    INT8: 1,
    UINT8: 1,
    INT16: 2,
    UINT16: 2,
    INT32: 4,
    UINT32: 4,
    INT64: 8,
    UINT64: 8,
    FLOAT32: 4,
    FLOAT64: 8,
};

/** The largest value of a normalized integer type. */
const NORMALIZED_RANGE: Readonly<Partial<Record<MetadataComponentType, number>>> = {
    INT8: 127,
    UINT8: 255,
    INT16: 32767,
    UINT16: 65535,
    INT32: 2147483647,
    UINT32: 4294967295,
};

function view(bytes: Uint8Array): DataView {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function component(data: DataView, type: MetadataComponentType, index: number): number | bigint {
    const offset = index * COMPONENT_BYTES[type];
    switch (type) {
        case "INT8":
            return data.getInt8(offset);
        case "UINT8":
            return data.getUint8(offset);
        case "INT16":
            return data.getInt16(offset, true);
        case "UINT16":
            return data.getUint16(offset, true);
        case "INT32":
            return data.getInt32(offset, true);
        case "UINT32":
            return data.getUint32(offset, true);
        case "INT64":
            return data.getBigInt64(offset, true);
        case "UINT64":
            return data.getBigUint64(offset, true);
        case "FLOAT32":
            return data.getFloat32(offset, true);
        case "FLOAT64":
            return data.getFloat64(offset, true);
    }
}

async function strings(column: IMetadataPropertyTableProperty, count: number, read: BufferViewReader): Promise<string[]> {
    if (column.stringOffsets === undefined) throw new Error("A string property needs stringOffsets.");
    const [values, offsets] = await Promise.all([read(column.values), read(column.stringOffsets)]);
    const type: IMetadataOffsetType = column.stringOffsetType ?? "UINT32";
    const data = view(offsets);
    const decoder = new TextDecoder();
    const at = (row: number): number => Number(component(data, type, row));
    return Array.from({ length: count }, (_, row) => decoder.decode(values.subarray(at(row), at(row + 1))));
}

async function booleans(column: IMetadataPropertyTableProperty, count: number, read: BufferViewReader): Promise<boolean[]> {
    const bits = await read(column.values);
    return Array.from({ length: count }, (_, row) => ((bits[row >> 3] ?? 0) & (1 << (row & 7))) !== 0);
}

async function scalars(
    definition: IMetadataClassProperty,
    column: IMetadataPropertyTableProperty,
    count: number,
    read: BufferViewReader,
): Promise<(number | bigint)[]> {
    const type = definition.componentType;
    if (!type || !(type in COMPONENT_BYTES)) throw new Error("A scalar property needs a componentType.");
    const data = view(await read(column.values));
    const range = definition.normalized ? NORMALIZED_RANGE[type] : undefined;
    // The table may override the offset and the scale of the class.
    const scale = column.scale ?? (typeof definition.scale === "number" ? definition.scale : undefined);
    const offset = column.offset ?? (typeof definition.offset === "number" ? definition.offset : undefined);
    return Array.from({ length: count }, (_, row) => {
        const raw = component(data, type, row);
        if (typeof raw === "bigint") return raw;
        let value = range ? Math.max(raw / range, -1) : raw;
        if (scale !== undefined) value *= scale;
        if (offset !== undefined) value += offset;
        return value;
    });
}

async function enums(
    definition: IMetadataEnum | undefined,
    column: IMetadataPropertyTableProperty,
    count: number,
    read: BufferViewReader,
): Promise<(string | number)[]> {
    const type = definition?.valueType ?? "UINT16";
    const data = view(await read(column.values));
    const names = new Map((definition?.values ?? []).map((item) => [item.value, item.name]));
    return Array.from({ length: count }, (_, row) => {
        const value = Number(component(data, type, row));
        return names.get(value) ?? value;
    });
}

export interface IPropertyTableColumns {
    /** The columns read, one value per row of the table. */
    values: Record<string, MetadataValue[]>;
    /** The properties left unread: arrays, vectors and matrices, or a property the class does not declare. */
    skipped: string[];
}

/**
 * Reads the columns of a property table of `EXT_structural_metadata` from their buffer views: strings, booleans,
 * scalars of every component type and enums, of properties that are not arrays. The types come from the class of
 * the table in the schema, which the asset must embed.
 */
export async function readPropertyTable(
    table: IMetadataPropertyTable,
    schema: IMetadataSchema,
    read: BufferViewReader,
): Promise<IPropertyTableColumns> {
    const definitions = schema.classes?.[table.class]?.properties ?? {};
    const values: Record<string, MetadataValue[]> = {};
    const skipped: string[] = [];
    await Promise.all(
        Object.entries(table.properties).map(async ([name, column]) => {
            const definition = definitions[name];
            if (!definition || definition.array) return void skipped.push(name);
            switch (definition.type) {
                case "STRING":
                    values[name] = await strings(column, table.count, read);
                    break;
                case "BOOLEAN":
                    values[name] = await booleans(column, table.count, read);
                    break;
                case "SCALAR":
                    values[name] = await scalars(definition, column, table.count, read);
                    break;
                case "ENUM":
                    values[name] = await enums(
                        definition.enumType ? schema.enums?.[definition.enumType] : undefined,
                        column,
                        table.count,
                        read,
                    );
                    break;
                default:
                    skipped.push(name);
            }
        }),
    );
    return { values, skipped };
}

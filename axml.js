/* Android Manifest Editor */

/* jshint esversion: 6 */
/* jshint node: true */
/* jshint bitwise: false */
"use strict";

const fs = require('fs');

function abort(message) {
    console.log('Failure: ' + message);
    process.exit(1);
}

function le32_get(array, offset) {
    return ((array[offset + 3] << 24) >>> 0) | ((array[offset + 2] << 16) >>> 0) | ((array[offset + 1] << 8) >>> 0) | array[offset];
}

function le16_get(array, offset) {
    return ((array[offset + 1] << 8) >>> 0) | array[offset];
}

function le32_put(array, offset, value) {
    array[offset] = value & 0xff;
    array[offset + 1] = (value & 0xff00) >>> 8;
    array[offset + 2] = (value & 0xff0000) >>> 16;
    array[offset + 3] = (value & 0xff000000) >>> 24;
}

function le16_put(array, offset, value) {
    array[offset] = value & 0xff;
    array[offset + 1] = (value & 0xff00) >>> 8;
}

function parse_manifest_header(array, offset) {
    const header = {
        magic: le16_get(array, offset),
        self_size: le16_get(array, offset + 2),
        file_size: le32_get(array, offset + 4)
    };

    if (header.magic !== 0x0003 || header.self_size !== 8) {
        abort('unrecognized manifest header');
    }

    return header;
}

function parse_string_pool(array, offset) {
    const header = {
        magic: le16_get(array, offset),
        self_size: le16_get(array, offset + 2),
        chunk_size: le32_get(array, offset + 4),
        nstrings: le32_get(array, offset + 8),
        nstyles: le32_get(array, offset + 12),
        flags: le32_get(array, offset + 16),
        strings_offset: le32_get(array, offset + 20),
        styles_offset: le32_get(array, offset + 24)
    };

    if (header.magic !== 0x0001 || header.self_size !== 28) {
        abort('unrecognized string pool header');
    }

    if (header.nstyles !== 0 || header.styles_offset !== 0) {
        abort('styles are not supported');
    }

    offset += header.strings_offset;

    const pool = [];

    for (let i = 0; i < header.nstrings; i++) {
        const slen = le16_get(array, offset) * 2;
        offset += 2;
        pool.push({
            index: i,
            length: slen,
            value: array.slice(offset, offset + slen).toString('utf16le')
        });
        offset += slen + 2;
    }

    return {
        header: header,
        pool: pool
    };
}

function parse_resource_pool(array, offset) {
    const header = {
        magic: le16_get(array, offset),
        self_size: le16_get(array, offset + 2),
        chunk_size: le32_get(array, offset + 4),
    };

    if (header.magic !== 0x0180 || header.self_size !== 8) {
        abort('unrecognized resource pool header');
    }

    const nresources = (header.chunk_size - header.self_size) / 4;
    offset += header.self_size;

    const pool = [];

    for (let i = 0; i < nresources; i++) {
        pool.push({
            value: le32_get(array, offset)
        });
        offset += 4;
    }

    return {
        header: header,
        pool: pool
    };
}

function bind_resource_ids(string_pool, resource_pool) {
    let bound = 0;

    for (let i = 0; i < resource_pool.pool.length; i++) {
        if (i >= string_pool.pool.length) {
            abort('resource range exceeded');
        }

        string_pool.pool[i].resource_id = resource_pool.pool[i].value;
        bound++;
    }

    console.log('bound ' + bound + ' resource ids.');
}

function type2str(type) {
    switch (type) {
        case 0x01000008:
            return 'id_ref';
        case 0x02000008:
            return 'attr_ref';
        case 0x03000008:
            return 'string';
        case 0x05000008:
            return 'dimen';
        case 0x06000008:
            return 'fraction';
        case 0x10000008:
            return 'int';
        case 0x04000008:
            return 'float';
        case 0x11000008:
            return 'flags';
        case 0x12000008:
            return 'bool';
        case 0x1c000008:
            return 'color';
        case 0x1d000008:
            return 'color2';
        default:
            return "" + type;
    }
}

function str2type(str) {
    switch (str) {
        case 'id_ref':
            return 0x01000008;
        case 'attr_ref':
            return 0x02000008;
        case 'string':
            return 0x03000008;
        case 'dimen':
            return 0x05000008;
        case 'fraction':
            return 0x06000008;
        case 'int':
            return 0x10000008;
        case 'float':
            return 0x04000008;
        case 'flags':
            return 0x11000008;
        case 'bool':
            return 0x12000008;
        case 'color':
            return 0x1c000008;
        case 'color2':
            return 0x1d000008;
        default:
            return parseInt(str);
    }
}

function parse_attribute(array, offset, string_pool) {
    const result = {
        namespace: le32_get(array, offset),
        name: le32_get(array, offset + 4),
        value: le32_get(array, offset + 8),
        type: type2str(le32_get(array, offset + 12)),
        resource_id: le32_get(array, offset + 16)
    };

    result.name_string = get_string_from_pool(string_pool, result.name);

    if (result.type === 0x03000008) { /* type string */
        result.value_string = get_string_from_pool(string_pool, result.value);
    }

    return result;
}

function parse_attributes(tag, array, offset, string_pool) {
    for (let i = 0; i < tag.attributes_count; i++) {
        tag.attributes.push(parse_attribute(array, offset + 36 + i * 20, string_pool));
    }
}

function get_string_from_pool(string_pool, index) {
    if (index >= string_pool.header.nstrings) {
        console.log('string index ' + index + ' out of range');
        return '(unknown)';
    }

    return string_pool.pool[index].value;
}

function parse_xml_tag(array, offset, string_pool) {
    let id = le32_get(array, offset);

    switch (id) {
        case 0x00100100:
        case 0x00100101:
            return {
                role: id === 0x00100100 ? 'start-ns' : 'end-ns',
                chunk_size: le32_get(array, offset + 4),
                line: le32_get(array, offset + 8),
                comment: le32_get(array, offset + 12),
                prefix: le32_get(array, offset + 16),
                namespace: le32_get(array, offset + 20)
            };
        case 0x00100102:
            const tag = {
                role: 'start-tag',
                chunk_size: le32_get(array, offset + 4),
                line: le32_get(array, offset + 8),
                comment: le32_get(array, offset + 12),
                namespace: le32_get(array, offset + 16),
                name: le32_get(array, offset + 20),
                name_string: get_string_from_pool(string_pool, le32_get(array, offset + 20)),
                attributes_size: le32_get(array, offset + 24),
                attributes_count: le32_get(array, offset + 28),
                attribute_id: le32_get(array, offset + 32),
                attributes: []
            };
            parse_attributes(tag, array, offset, string_pool);
            return tag;
        case 0x00100104:
            return {
                role: 'text',
                chunk_size: le32_get(array, offset + 4),
                line: le32_get(array, offset + 8),
                comment: le32_get(array, offset + 12),
                string_id: le32_get(array, offset + 16),
                unused1: le32_get(array, offset + 20),
                unused2: le32_get(array, offset + 24)
            };
        case 0x00100103:
            return {
                role: 'end-tag',
                chunk_size: le32_get(array, offset + 4),
                line: le32_get(array, offset + 8),
                comment: le32_get(array, offset + 12),
                namespace: le32_get(array, offset + 16),
                name: le32_get(array, offset + 20),
                name_string: get_string_from_pool(string_pool, le32_get(array, offset + 20))
            };
        default:
            abort('unrecognized tag found');
    }
}

function decompress_xml(source, destination) {
    const array = fs.readFileSync(source);
    let offset = 0;

    const manifest = parse_manifest_header(array, offset);
    offset += manifest.self_size;

    console.log('file size: ' + manifest.file_size + ' bytes.');

    const string_pool = parse_string_pool(array, offset);
    offset += string_pool.header.chunk_size;

    console.log('parsed string pool.');

    const resource_pool = parse_resource_pool(array, offset);
    offset += resource_pool.header.chunk_size;

    console.log('parsed resource pool.');

    bind_resource_ids(string_pool, resource_pool);

    const xml = [];

    while (offset < array.length) {
        const tag = parse_xml_tag(array, offset, string_pool);
        xml.push(tag);
        offset += tag.chunk_size;
    }

    console.log('parsed xml document.');

    const result = {
        string_pool: string_pool.pool,
        xml: xml
    };

    fs.writeFileSync(destination, JSON.stringify(result, null, 4));
    console.log('done xml decompressing.');
}

function put_manifest_header(array, offset, file_size) {
    le32_put(array, offset, 0x0003); /* magic bytes */
    le32_put(array, offset + 2, 8); /* self size */
    le32_put(array, offset + 4, file_size); /* file size */

    return 8; /* chunk size */
}

function put_string_pool(array, base, strings) {
    le32_put(array, base, 0x0001); /* magic bytes */
    le32_put(array, base + 2, 28); /* self size */
    le32_put(array, base + 8, strings.length);
    le32_put(array, base + 12, 0); /* nstyles */
    le32_put(array, base + 16, 0); /* flags */

    le32_put(array, base + 24, 0); /* styles offset */

    let offset = base + 28;

    let index = 0;
    for (let i = 0; i < strings.length; i++) {
        le32_put(array, offset, index);
        offset += 4;
        index += 4 + strings[i].length;
    }

    le32_put(array, base + 20, offset - base); /* strings offset */

    for (let i = 0; i < strings.length; i++) {
        const svalue = Buffer.from(strings[i].value, 'utf16le');
        if (svalue.length !== strings[i].length) {
            abort('string #' + i + ' length is invalid');
        }
        le16_put(array, offset, strings[i].length / 2);
        offset += 2;

        svalue.copy(array, offset, 0, svalue.length);
        offset += svalue.length;

        le16_put(array, offset, 0); /* string terminator */
        offset += 2;
    }

    let chunk_size = offset - base;
    if (chunk_size % 4) {
        chunk_size += 4 - chunk_size % 4; /* align to 4 bytes */
    }

    le32_put(array, base + 4, chunk_size);
    return base + chunk_size;
}

function put_resource_pool(array, base, strings) {
    le32_put(array, base, 0x0180); /* magic bytes */
    le32_put(array, base + 2, 8); /* self size */

    let offset = base + 8;

    let i;
    for (i = 0; i < strings.length; i++) {
        if (strings[i].resource_id === undefined) {
            break;
        }

        le32_put(array, offset, strings[i].resource_id);
        offset += 4;
    }

    while (i < strings.length) {
        if (strings[i].resource_id !== undefined) {
            abort('string #' + i + ' resource id out of order');
        }
        i++;
    }

    const chunk_size = offset - base; /* no need to align */
    le32_put(array, base + 4, chunk_size);

    return base + chunk_size;
}

function put_attribute(array, offset, attribute) {
    le32_put(array, offset, attribute.namespace);
    le32_put(array, offset + 4, attribute.name);
    le32_put(array, offset + 8, attribute.value);
    le32_put(array, offset + 12, str2type(attribute.type));
    le32_put(array, offset + 16, attribute.resource_id);
}

function put_xml_tag(array, offset, tag) {
    switch (tag.role) {
        case 'start-ns':
        case 'end-ns':
            le32_put(array, offset, tag.role == 'start-ns' ? 0x00100100 : 0x00100101); /* role */
            le32_put(array, offset + 4, tag.chunk_size);
            le32_put(array, offset + 8, tag.line);
            le32_put(array, offset + 12, tag.comment);
            le32_put(array, offset + 16, tag.prefix);
            le32_put(array, offset + 20, tag.namespace);
            break;

        case 'start-tag':
            le32_put(array, offset, 0x00100102); /* role */
            le32_put(array, offset + 4, tag.chunk_size);
            le32_put(array, offset + 8, tag.line);
            le32_put(array, offset + 12, tag.comment);
            le32_put(array, offset + 16, tag.namespace);
            le32_put(array, offset + 20, tag.name);
            le32_put(array, offset + 24, tag.attributes_size);
            le32_put(array, offset + 28, tag.attributes_count);
            le32_put(array, offset + 32, tag.attribute_id);
            for (let i = 0; i < tag.attributes_count; i++) {
                put_attribute(array, offset + 36 + i * 20, tag.attributes[i]);
            }
            break;

        case 'text':
            le32_put(array, offset, 0x00100104); /* role */
            le32_put(array, offset + 4, tag.chunk_size);
            le32_put(array, offset + 8, tag.line);
            le32_put(array, offset + 12, tag.comment);
            le32_put(array, offset + 16, tag.string_id);
            le32_put(array, offset + 20, tag.unused1);
            le32_put(array, offset + 24, tag.unused2);
            break;

        case 'end-tag':
            le32_put(array, offset, 0x00100103); /* role */
            le32_put(array, offset + 4, tag.chunk_size);
            le32_put(array, offset + 8, tag.line);
            le32_put(array, offset + 12, tag.comment);
            le32_put(array, offset + 16, tag.namespace);
            le32_put(array, offset + 20, tag.name);
            break;

        default:
            abort('invalig xml tag role: ' + tag.role);
    }

    return offset + tag.chunk_size;
}

function put_xml_documet(array, offset, xml) {
    for (let i = 0; i < xml.length; i++) {
        offset = put_xml_tag(array, offset, xml[i]);
    }

    return offset;
}

function compress_xml(source, destination) {
    const text = fs.readFileSync(source, 'utf8');
    const input = JSON.parse(text);
    const array = Buffer.alloc(text.length + 32000);

    let offset = put_manifest_header(array, 0, -1);
    console.log('put manifest header.');

    offset = put_string_pool(array, offset, input.string_pool);
    console.log('put string pool.');

    offset = put_resource_pool(array, offset, input.string_pool);
    console.log('put resource pool.');

    offset = put_xml_documet(array, offset, input.xml);
    console.log('put xml document.');

    put_manifest_header(array, 0, offset);
    console.log('set file size to ' + offset + ' bytes.');

    fs.writeFileSync(destination, array.slice(0, offset));
    console.log('done xml compressing.');
}

function show_usage() {
    console.log('usage: node axml.js [-dc] source destination');
    console.log("");
    console.log('options:');
    console.log('  -d  decompress manifest file');
    console.log('  -c  compress manifest file');
    console.log("");
}

function main() {
    console.log('axml utility - ver. 1.0.18');

    if (process.argv.length !== 5) {
        show_usage();
        process.exit(1);
        return;
    }

    const option = process.argv[2];
    const source = process.argv[3];
    const destination = process.argv[4];

    switch (option) {
        case '-d':
            decompress_xml(source, destination);
            break;
        case '-c':
            compress_xml(source, destination);
            break;
        default:
            show_usage();
            process.exit(1);
            return;
    }
}

main();

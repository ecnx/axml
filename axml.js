/* Android Manifest (De)Compress Utility */

/* jshint esversion: 6 */
/* jshint node: true */
/* jshint bitwise: false */
"use strict";

const fs = require('fs');

/* --- Attribute Types List --- */

const attrtypes = {
    id_ref: 0x01000008,
    attr_ref: 0x02000008,
    string: 0x03000008,
    dimen: 0x05000008,
    fraction: 0x06000008,
    int: 0x10000008,
    float: 0x04000008,
    flags: 0x11000008,
    bool: 0x12000008,
    color: 0x1c000008,
    color2: 0x1d000008
};

/* --- Tag Types List --- */

const tagtypes = {
    start_ns: 0x00100100,
    end_ns: 0x00100101,
    start_tag: 0x00100102,
    text: 0x00100104,
    end_tag: 0x00100103
};

/* --- Binary Data Patterns --- */

const patterns = {
    manifest_header: [
        'magic:le16',
        'self_size:le16',
        'file_size:le32'
    ],
    string_pool: [
        'magic:le16',
        'self_size:le16',
        'chunk_size:le32',
        'nstrings:le32',
        'nstyles:le32',
        'flags:le32',
        'strings_offset:le32',
        'styles_offset:le32'
    ],
    resource_pool: [
        'magic:le16',
        'self_size:le16',
        'chunk_size:le32'
    ],
    attribute: [
        'namespace:le32',
        'name_str_index:le32',
        'value_str_index:le32',
        'type:le32',
        'resource_id:le32'
    ],
    start_ns: [
        'role:le32',
        'chunk_size:le32',
        'line_no:le32',
        'comment:le32',
        'prefix:le32',
        'namespace:le32'
    ],
    end_ns: [
        'role:le32',
        'chunk_size:le32',
        'line_no:le32',
        'comment:le32',
        'prefix:le32',
        'namespace:le32'
    ],
    start_tag: [
        'role:le32',
        'chunk_size:le32',
        'line_no:le32',
        'comment:le32',
        'namespace:le32',
        'name_str_index:le32',
        'attributes_size:le32',
        'attributes_count:le32',
        'attribute_id:le32'
    ],
    text: [
        'role:le32',
        'chunk_size:le32',
        'line_no:le32',
        'comment:le32',
        'text_str_index:le32',
        'unused1:le32',
        'unused2:le32'
    ],
    end_tag: [
        'role:le32',
        'chunk_size:le32',
        'line_no:le32',
        'comment:le32',
        'namespace:le32',
        'name_str_index:le32'
    ]
};

/* --- Text and Number Processing --- */

function number0x(number, nplaces) {
    return '0x' + number.toString(16).padStart(nplaces, '0');
}

/* --- Binary Data Access --- */

function check_bounds(array, offset, size) {
    if (array.length < offset + size) {
        throw new Error('Binary data index out of bounds');
    }
}

function le16_get(array, offset) {
    check_bounds(array, offset, 2);
    return ((array[offset + 1] << 8) | array[offset]) >>> 0;
}

function le32_get(array, offset) {
    check_bounds(array, offset, 4);
    return ((array[offset + 3] << 24) | (array[offset + 2] << 16) |
        (array[offset + 1] << 8) | array[offset]) >>> 0;
}

function le32_put(array, offset, value) {
    array[offset] = (value & 0xff) >>> 0;
    array[offset + 1] = (value & 0xff00) >>> 8;
    array[offset + 2] = (value & 0xff0000) >>> 16;
    array[offset + 3] = (value & 0xff000000) >>> 24;
}

function le16_put(array, offset, value) {
    array[offset] = (value & 0xff) >>> 0;
    array[offset + 1] = (value & 0xff00) >>> 8;
}

function unpack_entity(array, base, pattern, string_pool) {
    const result = {};
    const str_index = '_str_index';
    for (let i = 0, offset = base; i < pattern.length; i++) {
        const patstr = pattern[i];
        const sepidx = patstr.indexOf(':');
        if (sepidx === -1) {
            throw new Error('Invalid unpack binary data pattern "' + patstr + '"');
        }
        const name = patstr.substring(0, sepidx);
        const type = patstr.substring(sepidx + 1);
        let value;
        switch (type) {
            case 'le16':
                value = le16_get(array, offset);
                offset += 2;
                break;
            case 'le32':
                value = le32_get(array, offset);
                offset += 4;
                break;
            default:
                throw new Error('Invalid unpack binary data pattern type: "' + type + '"');
        }
        result[name] = value;
        if (string_pool) {
            if (name.endsWith(str_index)) {
                const basename = name.substring(0, name.length - str_index.length);
                result[basename + '_str_readonly'] = string_by_idx(string_pool, value);
            }
        }
    }
    return result;
}

function pack_entity(array, base, pattern, object) {
    let offset = base;
    for (let i = 0; i < pattern.length; i++) {
        const patstr = pattern[i];
        const sepidx = patstr.indexOf(':');
        if (sepidx === -1) {
            throw new Error('Invalid pack binary data pattern "' + patstr + '"');
        }
        const name = patstr.substring(0, sepidx);
        const type = patstr.substring(sepidx + 1);
        if (!object.hasOwnProperty(name)) {
            throw new Error('Invalid pack binary data pattern name: "' + name + '"');
        }
        const value = object[name];
        switch (type) {
            case 'le16':
                le16_put(array, offset, value);
                offset += 2;
                break;
            case 'le32':
                le32_put(array, offset, value);
                offset += 4;
                break;
            default:
                throw new Error('Invalid pack binary data pattern type: "' + type + '"');
        }
    }
    return offset;
}

/* --- Android Manifest Decompressing --- */

function unpack_manifest_header(array, base) {
    const header = unpack_entity(array, base, patterns.manifest_header);

    if (header.magic !== 0x0003) {
        throw new Error('Unrecognized Android Manifest Header');
    }

    if (header.self_size !== 8) {
        throw new Error('Invalid manifest header self size');
    }

    return header;
}

function unpack_string_pool(array, base) {
    const string_pool = unpack_entity(array, base, patterns.string_pool);

    if (string_pool.magic !== 0x0001 || string_pool.self_size !== 28) {
        throw new Error('Unrecognized string pool magic');
    }

    if (string_pool.self_size !== 28) {
        throw new Error('Invalid string pool size size');
    }

    if (string_pool.nstyles !== 0 || string_pool.styles_offset !== 0) {
        console.log('Warning: Styles in string pool are not supported');
    }

    string_pool.strings = [];

    for (let i = 0, offset = base + string_pool.strings_offset; i < string_pool.nstrings; i++) {
        const slen = le16_get(array, offset) * 2;
        offset += 2;
        string_pool.strings.push({
            index: i,
            value: array.slice(offset, offset + slen).toString('utf16le')
        });
        offset += slen + 2;
    }

    return string_pool;
}

function unpack_resource_pool(array, base) {
    const resource_pool = unpack_entity(array, base, patterns.resource_pool);

    if (resource_pool.magic !== 0x0180) {
        throw new Error('Unrecognized resource pool magic');
    }

    if (resource_pool.self_size !== 8) {
        throw new Error('Invalid resource pool self size');
    }

    resource_pool.resources = [];
    const nresources = (resource_pool.chunk_size - resource_pool.self_size) / 4;

    for (let i = 0, offset = base + resource_pool.self_size; i < nresources; i++) {
        resource_pool.resources.push({
            id: le32_get(array, offset)
        });
        offset += 4;
    }

    return resource_pool;
}

function bind_strings_resource_ids(string_pool, resource_pool) {
    if (string_pool.strings.length < resource_pool.resources.length) {
        throw new Error('Not enough strings for resources ids');
    }

    for (let i = 0; i < resource_pool.resources.length; i++) {
        string_pool.strings[i].resource_id = resource_pool.resources[i].id;
    }
}

function dict_num2str(dict, num) {
    for (let key in dict) {
        if (dict.hasOwnProperty(key)) {
            if (dict[key] === num) {
                return key;
            }
        }
    }
    return "" + num;
}

function type2str(type) {
    return dict_num2str(attrtypes, type);
}

function role2str(role) {
    return dict_num2str(tagtypes, role);
}

function string_by_idx(string_pool, index) {
    if (index >= string_pool.nstrings) {
        return "";
    }

    return string_pool.strings[index].value;
}

function unpack_attribute(array, offset, string_pool) {
    const attribute = unpack_entity(array, offset, patterns.attribute, string_pool);
    attribute.type = type2str(attribute.type);
    return attribute;
}

function unpack_attributes(tag, array, offset, string_pool) {
    const attributes = [];
    for (let i = 0; i < tag.attributes_count; i++) {
        attributes.push(unpack_attribute(array, offset + 36 + i * 20, string_pool));
    }
    return attributes;
}

function unpack_xml_tag_internal(array, offset, string_pool) {
    let type = le32_get(array, offset);

    switch (type) {
        case tagtypes.start_ns:
            return unpack_entity(array, offset, patterns.start_ns);
        case tagtypes.end_ns:
            return unpack_entity(array, offset, patterns.end_ns);
        case tagtypes.start_tag:
            const tag = unpack_entity(array, offset, patterns.start_tag, string_pool);
            tag.attributes = unpack_attributes(tag, array, offset, string_pool);
            return tag;
        case tagtypes.text:
            return unpack_entity(array, offset, patterns.text, string_pool);
        case tagtypes.end_tag:
            return unpack_entity(array, offset, patterns.end_tag, string_pool);
        default:
            throw new Error('Unknown type tag found: ' + number0x(type, 8));
    }
}

function unpack_xml_tag(array, offset, string_pool) {
    const tag = unpack_xml_tag_internal(array, offset, string_pool);
    tag.role = role2str(tag.role);
    return tag;
}

function count_xml_tags(tags, role) {
    let count = 0;
    for (let i = 0; i < tags.length; i++) {
        if (tags[i].role === role) {
            count++;
        }
    }
    return count;
}

/* --- Decompress Android Manifest Task --- */

function decompress_android_manifest(srcfile, dstfile) {
    const array = fs.readFileSync(srcfile);
    let offset = 0;

    const manifest = unpack_manifest_header(array, offset);
    const sizestatus = manifest.file_size === array.length ? 'ok' : 'bad';
    console.log('parsed manifest header:');
    console.log(' -- offset     : ' + offset + ' bytes');
    console.log(' -- magic      : ' + number0x(manifest.magic, 4));
    console.log(' -- self size  : ' + manifest.self_size + ' bytes');
    console.log(' -- file size  : ' + manifest.file_size + ' bytes (' + sizestatus + ')');
    offset += manifest.self_size;

    const string_pool = unpack_string_pool(array, offset);
    console.log('parsed string pool:');
    console.log(' -- offset     : ' + offset + ' bytes');
    console.log(' -- magic      : ' + number0x(string_pool.magic, 4));
    console.log(' -- self size  : ' + string_pool.self_size + ' bytes');
    console.log(' -- chunk size : ' + string_pool.chunk_size + ' bytes');
    console.log(' -- nstrings   : ' + string_pool.nstrings);
    console.log(' -- nstyles    : ' + string_pool.nstyles);
    console.log(' -- flags      : ' + number0x(string_pool.flags.toString(16), 4));
    console.log(' -- offstrings : ' + string_pool.strings_offset + ' bytes');
    console.log(' -- offstyles  : ' + string_pool.styles_offset + ' bytes');
    offset += string_pool.chunk_size;

    const resource_pool = unpack_resource_pool(array, offset);
    console.log('parsed resource pool:');
    console.log(' -- offset     : ' + offset + ' bytes');
    console.log(' -- magic      : ' + number0x(resource_pool.magic, 4));
    console.log(' -- self size  : ' + resource_pool.self_size + ' bytes');
    offset += resource_pool.chunk_size;

    bind_strings_resource_ids(string_pool, resource_pool);

    const tags = [];
    while (offset < array.length) {
        const tag = unpack_xml_tag(array, offset, string_pool);
        tags.push(tag);
        offset += tag.chunk_size;
    }
    console.log('parsed xml tags:');
    console.log(' -- start-ns   : ' + count_xml_tags(tags, 'start_ns') + ' tags');
    console.log(' -- end-ns     : ' + count_xml_tags(tags, 'end_ns') + ' tags');
    console.log(' -- start-tag  : ' + count_xml_tags(tags, 'start_tag') + ' tags');
    console.log(' -- text       : ' + count_xml_tags(tags, 'text') + ' tags');
    console.log(' -- end-tag    : ' + count_xml_tags(tags, 'end_tag') + ' tags');
    console.log(' -- total      : ' + tags.length + ' tags');

    const result = {
        strings_editable: string_pool.strings,
        tags_editable: tags
    };

    fs.writeFileSync(dstfile, JSON.stringify(result, null, 4));
    console.log('decompressed android manifest into json.');
}

/* --- Android Manifest Compressing --- */

function pack_manifest_header(array, offset, manifest_header) {
    return pack_entity(array, offset, patterns.manifest_header, manifest_header);
}

function pack_string_pool(array, base, strings) {
    const self_size = 28;
    let offset = self_size;

    const svalues = [];

    for (let i = 0; i < strings.length; i++) {
        svalues.push(Buffer.from(strings[i].value, 'utf16le'));
    }

    le32_put(array, offset, 0);
    offset += 4;
    le32_put(array, offset, 0);
    offset += 4;

    for (let i = 0, stroff = 0; i < strings.length; i++) {
        le32_put(array, offset, stroff);
        offset += 4;
        stroff += 4 + svalues[i].length;
    }

    const strings_offset = offset - base;

    for (let i = 0; i < strings.length; i++) {
        const svalue = svalues[i];
        le16_put(array, offset, svalue.length / 2);
        offset += 2;
        svalue.copy(array, offset, 0, svalue.length);
        offset += svalue.length;
        le16_put(array, offset, 0x0000);
        offset += 2;
    }

    let chunk_size = offset - base;
    if (chunk_size % 4) {
        chunk_size += 4 - chunk_size % 4;
    }

    pack_entity(array, base, patterns.string_pool, {
        magic: 0x0001,
        self_size: 28,
        chunk_size: chunk_size,
        nstrings: strings.length,
        nstyles: 0,
        flags: 0,
        strings_offset: strings_offset,
        styles_offset: 0
    });

    return base + chunk_size;
}

function pack_resource_pool(array, base, strings) {
    const self_size = 8;
    let offset = base + self_size;

    let i;
    for (i = 0; i < strings.length; i++) {
        const string = strings[i];
        if (!string.hasOwnProperty('resource_id')) {
            break;
        }
        le32_put(array, offset, string.resource_id);
        offset += 4;
    }

    while (i < strings.length) {
        if (strings[i].hasOwnProperty('resource_id')) {
            throw new Error('No Resource ID for String#' + i + '+');
        }
        i++;
    }

    const chunk_size = offset - base;

    pack_entity(array, base, patterns.resource_pool, {
        magic: 0x0180,
        self_size: self_size,
        chunk_size: chunk_size,
    });

    return base + chunk_size;
}

function dict_str2num(dict, str) {
    if (dict.hasOwnProperty(str)) {
        return dict[str];
    }
    const num = Number(str);
    if (isNaN(num)) {
        throw new Error('Invalid dictionary key: "' + str + '"');
    }
    return num;
}

function str2type(str) {
    return dict_str2num(attrtypes, str);
}

function str2role(str) {
    return dict_str2num(tagtypes, str);
}

function pack_attribute(array, offset, attribute) {
    attribute.type = str2type(attribute.type);
    return pack_entity(array, offset, patterns.attribute, attribute);
}

function pack_xml_tag(array, offset, tag) {
    switch (tag.role) {
        case tagtypes.start_ns:
            pack_entity(array, offset, patterns.start_ns, tag);
            break;
        case tagtypes.end_ns:
            pack_entity(array, offset, patterns.end_ns, tag);
            break;
        case tagtypes.start_tag:
            const attrbase = pack_entity(array, offset, patterns.start_tag, tag);
            for (let i = 0, attroff = attrbase; i < tag.attributes_count; i++) {
                attroff = pack_attribute(array, attroff, tag.attributes[i]);
            }
            break;
        case tagtypes.text:
            pack_entity(array, offset, patterns.text, tag);
            break;
        case tagtypes.end_tag:
            pack_entity(array, offset, patterns.end_tag, tag);
            break;
        default:
            throw new Error('Invalig xml tag role: ' + tag.role);
    }

    return offset + tag.chunk_size;
}

function pack_xml_documet(array, offset, tags) {
    for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        tag.role = str2role(tag.role);
        offset = pack_xml_tag(array, offset, tag);
    }

    return offset;
}

/* --- Compress Android Manifest Task --- */

function compress_android_manifest(srcfile, dstfile) {
    const text = fs.readFileSync(srcfile, 'utf8');
    const json = JSON.parse(text);

    if (!Array.isArray(json.strings_editable) || !Array.isArray(json.tags_editable)) {
        throw new Error('Input JSON File is invalid');
    }

    const array = Buffer.alloc(text.length + 32000);

    let offset = pack_manifest_header(array, 0, {
        magic: 0xffff,
        self_size: 0xffff,
        file_size: 0
    });

    console.log('packed manifest header.');

    offset = pack_string_pool(array, offset, json.strings_editable);
    console.log('packed string pool.');

    offset = pack_resource_pool(array, offset, json.strings_editable);
    console.log('packed resource pool.');

    offset = pack_xml_documet(array, offset, json.tags_editable);
    console.log('packed xml tags.');

    pack_manifest_header(array, 0, {
        magic: 0x0003,
        self_size: 8,
        file_size: offset
    });

    console.log('updated manifest header.');

    fs.writeFileSync(dstfile, array.slice(0, offset));
    console.log('compressed json into android manifest.');
}

/* --- Program Usage Help --- */

function print_usage() {
    console.log([
        "",
        'usage: node axml.js -dch srcfile dstfile',
        "",
        'options:',
        '  -d  decompress manifest file',
        '  -c  compress manifest file',
        '  -h  print help message',
        ""
    ].join('\n'));
}

/* --- Program Startup --- */

function startup() {
    console.log('axml (de)compress utility - ver. 2.0.1');
    if (process.argv.length !== 5) {
        print_usage();
        process.exit(1);
        return;
    }

    const option = process.argv[2];
    const srcfile = process.argv[3];
    const dstfile = process.argv[4];

    try {
        switch (option) {
            case '-d':
                decompress_android_manifest(srcfile, dstfile);
                break;
            case '-c':
                compress_android_manifest(srcfile, dstfile);
                break;
            default:
                print_usage();
                process.exit(1);
                return;
        }
    } catch (err) {
        console.error("" + err);
        process.exit(1);
    }
}

startup();

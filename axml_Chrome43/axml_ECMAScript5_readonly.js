/* Android Manifest Reader */
"use strict";

function abort(message) {
    throw ('Failure: ' + message);
}

function le32_get(array, offset) {
    return (array[offset + 3] << 24) | (array[offset + 2] << 16) | (array[offset + 1] << 8) | array[offset];
}

function le16_get(array, offset) {
    return (array[offset + 1] << 8) | array[offset];
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
        var str = utf16ToUtf8(String.fromCharCode.apply(null, array.slice(offset, offset + slen)));
        pool.push({
            index: i,
            length: slen,
            value: str
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

function parse_attribute(array, offset, string_pool) {
    const result = {
        namespace: le32_get(array, offset),
        name: le32_get(array, offset + 4),
        value: le32_get(array, offset + 8),
        type: type2str(le32_get(array, offset + 12)),
        resource_id: le32_get(array, offset + 16)
    };

    result.name_string = get_string_from_pool(string_pool, result.name);

    if (result.type === 0x03000008) { // type string
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

function decompress_xml(source) {
    const array = source;
    let offset = 0;

    const manifest = parse_manifest_header(array, offset);
    offset += manifest.self_size;

    console.log('file size: ' + manifest.file_size + ' bytes.');

    const string_pool = parse_string_pool(array, offset);
    offset += string_pool.header.chunk_size;

    // console.log('parsed string pool.');

    const resource_pool = parse_resource_pool(array, offset);
    offset += resource_pool.header.chunk_size;

    // console.log('parsed resource pool.');

    bind_resource_ids(string_pool, resource_pool);

    const xml = [];

    while (offset < array.length) {
        const tag = parse_xml_tag(array, offset, string_pool);
        xml.push(tag);
        offset += tag.chunk_size;
    }

    // console.log('parsed xml document.');

    const result = {
        string_pool: string_pool.pool,
        xml: xml
    };

    // console.log('done xml decompressing.');
    return result;
}

function parse_to_xml(source){
	if(source.constructor.name != 'Array'){
		source = arr(source);
	}
	var j = decompress_xml(source);
	
	pl(j); // preview
	
	// ===== ===== ===== =====
	
	// convert to custom json format, for convert to xml later
	var s = j.string_pool,
	 doc = {
		ns: [], // namespace pool
	 },
	 cur_tag = doc;
	var first_start_tag = true;
	j.xml.foreach(function(e){
		switch(e.role){
			case 'start-ns':
				doc.ns[e.namespace] = {
					name: s[e.prefix].value,
					url: s[e.namespace].value
				};
				break;
			case 'start-tag':
				var t = {};
				t.__parent = cur_tag;
				t.name = (e.namespace == -1? '': doc.ns[e.namespace].name + ':') + e.name_string;
				if('attributes' in e){
					t.attr = [];
					e.attributes.foreach(function(f){
						var a = {};
						a.name = (f.namespace == -1? '': doc.ns[f.namespace].name + ':') + f.name_string;
						switch(f.type){
							case 'int':
								a.value = f.resource_id;
								break;
							case 'string':
								a.value = s[f.value].value;
								break;
							case 'bool':
								a.value = f.value == 0? 'false': 'true';
								break;
							case 'id_ref':
								a.value = '@' + f.resource_id.toString(16);
								break;
							case 'flags':
								a.value = android_R_attr.toString(a.name, f.resource_id);
								break;
							default:
								pl('uncase value type: '+f.type);
						}
						t.attr.push(a);
					});
				}
				if(!('_children' in cur_tag)){
					cur_tag._children = [];
				}
				cur_tag._children.push(t);
				cur_tag = t;
				break;
			case 'end-tag':
				cur_tag = cur_tag.__parent;
				break;
		}
	});
	
	// push namespace to the root node
	var rootnode = doc._children[0];
	if(!('attr' in rootnode)) rootnode.attr = [];
	doc.ns.foreach(function(e){
		if(!e) return;
		rootnode.attr.push({
			name: 'xmlns:' + e.name,
			value: e.url
		});
	});
	
	pl(doc); // preview
	
	// ===== ===== ===== =====
	
	// convert the custom json to xml
	var dom = '<?xml version="1.0" encoding="utf-8"?>',
	 processor = function(e){
		var attr = '';
		if('attr' in e){
			e.attr.foreach(function(f){
				attr += ` ${f.name}="${f.value}"`; // 先拼接节点属性
			});
		}
		var firstline = '<' + e.name + attr, // 拼接节点头部（不确定有没有子节点所以先放着）
			childline = '',
			lastline = '';
		if('_children' in e && e._children.length > 0){
			firstline += '>'; // 确定有子节点，补充节点头部
			lastline = `</${e.name}>`; // 由于有子节点，那么节点尾部就是这样的
			e._children.foreach(function(f){
				childline += processor(f); // 拼接子节点（递归）
			});
		}else{
			lastline = ' />'; // 由于没有子节点，那么节点尾部是这样的
		}
		return firstline + childline + lastline;
	 };
	var output = dom + processor(doc._children[0]);
	
	// return output;
	ft('textarea')[0].innerText = output;
}

function utf16ToUtf8(s){
	if(!s) return;
	
	var i, code, ret = [], len = s.length;
	for(i = 0; i < len; i++){
		code = s.charCodeAt(i);
		if(code > 0x0 && code <= 0x7f){
			// 单字节
			// UTF-16 0000 - 007F
			// UTF-8  0xxxxxxx
			ret.push(s.charAt(i));
		}else if(code >= 0x80 && code <= 0x7ff){
			// 双字节
			// UTF-16 0080 - 07FF
			// UTF-8  110xxxxx 10xxxxxx
			ret.push(
				String.fromCharCode(0xc0 | ((code >> 6) & 0x1f)), // 110xxxxx
				String.fromCharCode(0x80 | (code & 0x3f)) // 10xxxxxx
			);
		}else if(code >= 0x800 && code <= 0xffff){
			// 三字节
			// UTF-16 0800 - FFFF
			// UTF-8  1110xxxx 10xxxxxx 10xxxxxx
			ret.push(
				String.fromCharCode(0xe0 | ((code >> 12) & 0xf)), // 1110xxxx
				String.fromCharCode(0x80 | ((code >> 6) & 0x3f)), // 10xxxxxx
				String.fromCharCode(0x80 | (code & 0x3f)) // 10xxxxxx
			);
		}
	}
	
	return ret.join('');
}

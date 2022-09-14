Decompress Example
------------------

```
> ./axml -d AndroidManifest.xml AndroidManifest.json

axml (de)compress utility - ver. 2.0.1
parsed manifest header:
 -- offset     : 0 bytes
 -- magic      : 0x0003
 -- self size  : 8 bytes
 -- file size  : 564212 bytes (ok)
parsed string pool:
 -- offset     : 8 bytes
 -- magic      : 0x0001
 -- self size  : 28 bytes
 -- chunk size : 150728 bytes
 -- nstrings   : 1927
 -- nstyles    : 0
 -- flags      : 0x0000
 -- offstrings : 7736 bytes
 -- offstyles  : 0 bytes
parsed resource pool:
 -- offset     : 150736 bytes
 -- magic      : 0x0180
 -- self size  : 8 bytes
parsed xml tags:
 -- start-ns   : 1 tags
 -- end-ns     : 1 tags
 -- start-tag  : 4362 tags
 -- text       : 0 tags
 -- end-tag    : 4362 tags
 -- total      : 8726 tags
decompressed android manifest into json.
```

Compress Example
----------------

```
> ./axml -c AndroidManifest.json AndroidManifest.xml

axml (de)compress utility - ver. 2.0.1
packed manifest header.
packed string pool.
packed resource pool.
packed xml tags.
updated manifest header.
compressed json into android manifest.
```

Help message
------------

```
> ./axml

axml (de)compress utility - ver. 2.0.1

usage: node axml.js -dch srcfile dstfile

options:
  -d  decompress manifest file
  -c  compress manifest file
  -h  print help message
```

Dependencies
------------
* nodejs

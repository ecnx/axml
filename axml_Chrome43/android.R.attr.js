var android_R_attr = {
	toString: function(name, value){
		var names = '';
		android_R_attr[name].foreach(function(e){
			if((value & e[0]) == e[0]){
				if(e[0] == 0 && names.length > 0){ // 0值键可以输出，但是要求在此之前没有输出任何东西，比如想要匹配 protectionLevel 中的 normal，那么就要求不能匹配比他优先级更高的值
					return; // 当之前已经输出过其他键时，跳过输出0值键
				}
				if(names.length > 0) names += '|'; // 第二个以及之后输出的，添加一个分隔符然后再连接
				names += e[1];
				value ^= e[0]; // 异或该值，使其更低优先级的值不可匹配。比如 protectionLevel 在匹配 signatureOrSystem 之后不可再匹配 signature 和 dangerous
			}
		});
		return names;
	},
	'android:configChanges': [ // 使用或运算符连接。https://developer.android.com/reference/android/R.attr?hl=zh-cn#configChanges
		[0x40000000, 'fontScale'],
		[    0x4000, 'colorMode'],
		[    0x2000, 'layoutDirection'],
		[    0x1000, 'density'],
		[     0x800, 'smallestScreenSize'],
		[     0x400, 'screenSize'],
		[     0x200, 'uiMode'],
		[     0x100, 'screenLayout'],
		[      0x80, 'orientation'],
		[      0x40, 'navigation'],
		[      0x20, 'keyboardHidden'],
		[      0x10, 'keyboard'],
		[         8, 'touchscreen'],
		[         4, 'locale'],
		[         2, 'mnc'],
		[         1, 'mcc']
	],
	'android:protectionLevel': [ // 使用或运算符连接。https://developer.android.com/reference/android/R.attr?hl=zh-cn#protectionLevel
		[0x1000000, 'retailDemo'],
		[ 0x800000, 'companion'],
		[ 0x200000, 'appPredictor'],
		[ 0x100000, 'incidentReportApprover'],
		[  0x80000, 'configurator'],
		[  0x40000, 'documenter'],
		[  0x20000, 'wellbeing'],
		[  0x10000, 'textClassifier'],
		[   0x8000, 'vendorPrivileged'],
		[   0x4000, 'oem'],
		[   0x2000, 'runtime'],
		[   0x1000, 'instant'],
		[    0x800, 'setup'],
		[    0x400, 'preinstalled'],
		[    0x200, 'verifier'],
		[    0x100, 'installer'],
		[     0x80, 'pre23'],
		[     0x40, 'appop'],
		[     0x20, 'development'],
		[     0x10, 'system'], // the name: "privileged" deprecated in api23
		[        3, 'signatureOrSystem'], // 常用
		[        2, 'signature'], // 常用
		[        1, 'dangerous'], // 常用
		[        0, 'normal'] // 常用
	]
};

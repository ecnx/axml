var htmlhead=document.head,
 htmlbody=document.body;
(function(){
	// Generic Method Compat
	if(!('contains' in String.prototype)) String.prototype.contains=function(s){ return this.indexOf(s)>-1; };
	var imed=false;
	HTMLInputElement.prototype.__defineGetter__('imeDisabled',function(){ return imed? true: false; });
	HTMLInputElement.prototype.__defineSetter__('imeDisabled',function(s){
		imed = s? true: false;
		this.onkeyup = imed? function(){
			var sel = this.selectionStart,
				sav = this.value,
				right = sav.substr(sel),
				lef = sav.substr(0, sel),
				aft = lef.replace(/'/g, ''),
				wipecount = lef.length - aft.length;
			if(sel != this.selectionEnd) return;
			this.blur();
			this.focus();
			this.value = aft + right;
			this.selectionStart = this.selectionEnd = sel - wipecount;
		}: undefined;
	});
	
	// IE Method Compat
	_proto(HTMLElement, 'remove', function(){ try{this.parentElement.removeChild(this);}catch(e){} });
	_proto(EventTarget, 'addEventListener', function(n,f){ this.attachEvent('on'+n, f); });
	_proto(String, 'includes', function(s){ return this.indexOf(s)>-1; });
	
	// Firefox Method Compat
	if(!('innerText' in document.body)){
		HTMLElement.prototype.__defineGetter__("innerText", function(){ return this.textContent; });
		HTMLElement.prototype.__defineSetter__("innerText", function(s){ return this.textContent=s; });
	}
	
	// Constom Method Modify
	_proto(Array, 'foreach', function(func){ for(var i=0; i<this.length; i++) try{ if(func(this[i], i, this)) return true; }catch(e){ pl(e); } }, true);
	/* e = curItem, i = curIndex, a = thisArray
		.foreach(function(e, i, a){
			
		});
	*/
	
	_proto(HTMLElement, 'appendChildren', function(){ var t = this; arr(arguments).foreach(function(e){ t.appendChild(e); }); });
	_proto(HTMLElement, 'prependChild', function(e){
		var f=this.firstElementChild;
		if(f) this.insertBefore(e,f); else this.appendChild(e);
	});
	_proto(HTMLElement, 'insertAfter', function(e,f){
		f=f.nextElementSibling;
		if(f) this.insertBefore(e,f); else this.appendChild(e);
	});
	_proto(Event, 'block', function(){ this.preventDefault(); this.stopPropagation(); });
	_proto(File, 'read', function(f){
		switch(true){
			case f instanceof Function:
				var r=f;
				f=new FileReader();
				f.onload=function(p){
					r(p.target.result, p);
				};
			case f instanceof FileReader:
				f.readAsText(this);
				return f; // FileReader
		}
	});
	_proto(String, 'format', function(){
		_this = this;
		arr(arguments).foreach(function(e, i){
			_this = _this.replace(new RegExp("\\{" + i + "\\}", "gm"), e);
		});
		return _this;
	});
	
	// Visual Basic
	_proto(String, 'left', function(n){ return this.substr(0, Math.abs(n)); });
	_proto(String, 'right', function(n){ n=Math.abs(n); return this.substr(-n, n); });
})();
function _proto(obj, name, fun, force){
	if(obj instanceof Function && obj.name == 'Object'){
		pl('不能修改 Object 基类，因为这会导致 jQuery 异常。');
		return;
	}
	if(!(name in obj.prototype) || force){
		obj.prototype[name] = fun;
		pl('baseLib: ' + obj.name + '.' + name);
	}
}
function isReady(){return document.readyState.toLowerCase()=='complete'}
function $(e){return document.querySelector(e);}
function $$(e){return document.querySelectorAll(e);}
function arr(o){return Array.prototype.slice.call(o);}
function fv(id){return document.getElementById(id);}
function ft(tag){return document.getElementsByTagName(tag);}
function fc(cname){return document.getElementsByClassName(cname);}
function ct(tag, t){
	if(arguments.length > 2) pl(new Error('Somewhere might using old version to create Elements. PLEASE UPDATE YOUR CODE.'));
	tag = {
		entity: null,
		raw: tag,
		data: tag.split(/[#\.\s]/g)
	};
	var nextStart = 0;
	tag.data.foreach(function(e){
		nextStart ++;
		if(e.length == 0) return; // continue
		nextStart --;
		switch(tag.raw.charAt(nextStart)){
			case ' ': case '.':
				addClass(tag.entity, e); break;
			case '#':
				tag.entity.id = e; break;
			default:
				tag.entity = document.createElement(e);
				nextStart --;
		}
		nextStart += e.length + 1;
	});
	if(t) tag.entity.innerText = t;
	return tag.entity;
}
function msgbox(msg){alert(msg);}
function inputbox(title,defalt){return prompt(title,defalt);}
function pl(s){console.log(s);}
function vaild(o){return!(o==undefined||o==null||isNaN(o));}
function gquery(n){ return _GET(n); } // get Query
function _GET(n){
	var r=location.search.match(new RegExp("[\?\&]"+n+"=([^\&]+)","i"));
	return r==null||r.length<1?'':r[1];
}
/*	patch() 参数情况：
	单个EventTarget：直接返回本体
	单个EventTarget但是用数组封装：返回该数组
	多个EventTarget：返回封装数组
	其他情况比如数组和EventTarget混用等：不管他
*/
function patch(){
	var args = arguments,
		insideSelf = args.length==1 && args[0] instanceof EventTarget;
	if(args.length==1 && args[0] instanceof Array) args = args[0]; // 如果参数只是一个数组而且没有别的东西，就分离解析
	for(var i=0; i<args.length; i++){
		args[i].on = function(){
			var prog = 0;
			do{
				var arglen = arguments.length;
				switch(arglen){
					case undefined:
					case 0: return;
					case 1:
						arguments = arguments[0];
						break;
					default:
						if(arguments[arglen-1] instanceof Function); else return; // 最后一个必须是 function
						var event_name = arguments[prog],
							befor_func = this['on'+event_name], // replaceable static function
							after_func = arguments[arglen-1];
						this['on'+event_name] = after_func;
						if(this instanceof EventTarget); else return;
						this['on'+event_name] = befor_func;
						this.addEventListener(event_name, after_func);
						if( ++prog == arglen ) return;
				}
			}while(true);
		}
	}
	if(insideSelf){
		args.on = function(){
			for(var i=0; i<this.length; i++) if(this[i].on) this[i].on(arguments);
		}
	}
	return insideSelf? args[0]: args;
}

(function(){for(var i=0,a=fc('webp');i<a.length;i++) webpReplace(a[i]);})();
function webpReplace(e,u){
	var a=new Image();
	a.src=/url\(\"?([^\"]*)\"?\)/.exec(e.style.backgroundImage)[1];
	a.onerror=function(){
		e.style.backgroundImage=u? u: 'url('+this.src.replace(/\.webp$/,'.png')+')';
		if(!fv('webpnotice')){
			var n=ct('div','您的浏览器不支持 WebP。'),m=ct('a','维基百科');
			n.id='webpnotice'; n.style.cssText='position:fixed; right:0; top:0; background-color:#fff; z-index:999';
			m.href="https://en.wikipedia.org/wiki/WebP"; m.target="_blank";
			n.appendChild(m); htmlbody.appendChild(n);
		}
	}
}

function getAbsMousePos(){ // 相对于页面获取的光标和触摸位置，适用于属性 position 的值是 absolute 的元素（相对于整个文档根部） // TODO: 总感觉这个有BUG没修
	var x,y,r=document.documentElement, e = window.event;
	if(e instanceof MouseEvent){
		x=e.clientX+htmlbody.scrollLeft+r.scrollLeft,
		y=e.clientY+htmlbody.scrollTop+r.scrollTop; 
	}else if(e instanceof TouchEvent){
		e=e.touches[0];
		x=e.pageX;
		y=e.pageY;
	}
	return{ x:x, y:y };
}
function getFixMousePos(){ // 相对于屏幕获取的光标和触摸位置，适用于属性 position 的值是 fixed 的元素
	var x,y,r=document.documentElement, e = window.event;
	if(e instanceof MouseEvent){
		x=e.clientX,
		y=e.clientY; 
	}else if(e instanceof TouchEvent){
		e=e.touches[0];
		x=e.clientX;
		y=e.clientY;
	}
	return{ x:x, y:y };
}

function hasClass(e,n){ return new RegExp("(\\s|^)"+n+"(\\s|$)").test(e.className); }
function addClass(e,n){ if(!hasClass(e,n)) e.className=(e.className+' '+n).trim(); }
function removeClass(e,n){ removeClassName(e,n); }
function removeClassName(e,n){ if(hasClass(e,n)) e.className=e.className.replace(new RegExp('(\\s|^)'+n+'(\\s|$)'), ''); }

function imports(){
	if(arguments.length == 1) arguments = arguments[0].split(',');
	if(arguments[0] instanceof Array) arguments = arguments[0];
	for(var i=0,a=arguments;i<a.length;i++) addJs(a[i]);
}
function addJs(url,async){
	var d=ct('script');
	if(async) d.async='async';
	d.type='application/javascript';
	d.src= /\$$/.test(url)?
		url.trim().replace(/\$$/,''):
		url.trim()+(/\.js$/i.test(url)?'':'.js');
	htmlbody.appendChild(d);
}
function addCss(url) {
	var link = ct('link');
	link.type='text/css';
	link.rel ='stylesheet';
	link.href= url;
	htmlhead.appendChild(link);
}

function copy(text){
	var ta = document.createElement("textarea");
	ta.style.position = 'fixed';
	ta.style.top = ta.style.left = '100%';
	ta.value = text;
	document.body.appendChild(ta);
	ta.select();
	try{
		var successful = document.execCommand('copy');
		var msg = successful ? '成功复制到剪贴板' : '该浏览器不支持点击复制到剪贴板';
		pl(msg)
	}catch(e){
		alert('浏览器不支持点击复制到剪贴板');
	}
	document.body.removeChild(textArea);
}

function cok_a(n,v,timeExpire,timeShift){
	if(timeExpire || timeShift){
		if(!(timeExpire instanceof Number || timeExpire instanceof Date)) timeExpire=new Date().getTime();
		if(!timeShift instanceof Number) timeShift=0;
		document.cookie=n+'='+escape(v)+';expires='+new Date(timeExpire+timeShift).toGMTString();
	}else
		document.cookie=n+'='+escape(v);
	return cok(n);
}
function cok(n){
	var k=document.cookie.match(new RegExp('(^| )'+n+'=([^;]*)(;|$)'));
	if(k)return unescape(k[2]);
	else return'';
}
function cok_d(n){
	var e=new Date();
	e.setTime(e.getTime()-1);
	document.cookie=n+'=0;expires='+e.toGMTString();
}

function modelAccessor(scope, element) {
  var expr = element.attr('name'),
      farmatterName = element.attr('ng-format') || NOOP,
      formatter = angularFormatter(farmatterName);
  if (!expr) throw "Required field 'name' not found.";
  if (!formatter) throw "Formatter named '" + farmatterName + "' not found.";
  return {
    get: function() {
      return formatter['format'](scope.$eval(expr));
    },
    set: function(value) {
      scope.$tryEval(expr + '=' + toJson(formatter['parse'](value)), element);
    }
  };
}

function compileValidator(expr) {
  return new Parser(expr).validator()();
}

function valueAccessor(scope, element) {
  var validatorName = element.attr('ng-validate') || NOOP,
      validator = compileValidator(validatorName),
      required = element.attr('ng-required'),
      lastError,
      invalidWidgets = scope.$invalidWidgets || {markValid:noop, markInvalid:noop};
  required = required || required === '';
  if (!validator) throw "Validator named '" + validatorName + "' not found.";
  function validate(value) {
    var error = required && !trim(value) ? "Required" : validator({self:scope, scope:{get:scope.$get, set:scope.$set}}, value);
    if (error !== lastError) {
      elementError(element, NG_VALIDATION_ERROR, error);
      lastError = error;
      if (error)
        invalidWidgets.markInvalid(element);
      else
        invalidWidgets.markValid(element);
    }
    return value;
  }
  return {
    get: function(){ return validate(element.val()); },
    set: function(value){ element.val(validate(value)); }
  };
}

function checkedAccessor(scope, element) {
  var domElement = element[0];
  return {
    get: function(){
      return !!domElement.checked;
    },
    set: function(value){
      domElement.checked = !!value;
    }
  };
}

function radioAccessor(scope, element) {
  var domElement = element[0];
  return {
    get: function(){
      return domElement.checked ? domElement.value : null;
    },
    set: function(value){
      domElement.checked = value == domElement.value;
    }
  };
}

function optionsAccessor(scope, element) {
  var options = element[0].options;
  return {
    get: function(){
      var values = [];
      foreach(options, function(option){
        if (option.selected) values.push(option.value);
      });
      return values;
    },
    set: function(values){
      var keys = {};
      foreach(values, function(value){ keys[value] = true; });
      foreach(options, function(option){
        option.selected = keys[option.value];
      });
    }
  };
}

function noopAccessor() { return { get: noop, set: noop }; }

var textWidget = inputWidget('keyup change', modelAccessor, valueAccessor, initWidgetValue('')),
    buttonWidget = inputWidget('click', noopAccessor, noopAccessor, noop),
    INPUT_TYPE = {
      'text':            textWidget,
      'textarea':        textWidget,
      'hidden':          textWidget,
      'password':        textWidget,
      'button':          buttonWidget,
      'submit':          buttonWidget,
      'reset':           buttonWidget,
      'image':           buttonWidget,
      'checkbox':        inputWidget('click', modelAccessor, checkedAccessor, initWidgetValue(false)),
      'radio':           inputWidget('click', modelAccessor, radioAccessor, radioInit),
      'select-one':      inputWidget('change', modelAccessor, valueAccessor, initWidgetValue(null)),
      'select-multiple': inputWidget('change', modelAccessor, optionsAccessor, initWidgetValue([]))
//      'file':            fileWidget???
    };

function initWidgetValue(initValue) {
  return function (model, view) {
    var value = view.get() || copy(initValue);
    if (isUndefined(model.get()) && isDefined(value))
      model.set(value);
  };
}

function radioInit(model, view, element) {
 var modelValue = model.get(), viewValue = view.get(), input = element[0];
 input.name = this.$id + '@' + input.name;
 if (isUndefined(modelValue)) model.set(null);
 if (viewValue !== null) model.set(viewValue);
}

function inputWidget(events, modelAccessor, viewAccessor, initFn) {
  return function(element) {
    var scope = this,
        model = modelAccessor(scope, element),
        view = viewAccessor(scope, element),
        action = element.attr('ng-change') || '';
    initFn.call(scope, model, view, element);
    this.$eval(element.attr('ng-init')||'');
    // Don't register a handler if we are a button (noopAccessor) and there is no action
    if (action || modelAccessor !== noopAccessor) {
      element.bind(events, function(){
        model.set(view.get());
        scope.$tryEval(action, element);
        scope.$root.$eval();
        // if we have noop initFn than we are just a button,
        // therefore we want to prevent default action
        return initFn != noop;
      });
    }
    view.set(model.get());
    scope.$watch(model.get, view.set);
  };
}

function inputWidgetSelector(element){
  this.directives(true);
  return INPUT_TYPE[lowercase(element[0].type)] || noop;
}

angularWidget('INPUT', inputWidgetSelector);
angularWidget('TEXTAREA', inputWidgetSelector);
angularWidget('BUTTON', inputWidgetSelector);
angularWidget('SELECT', function(element){
  this.descend(true);
  return inputWidgetSelector.call(this, element);
});


angularWidget('NG:INCLUDE', function(element){
  var compiler = this,
      src = element.attr("src");
  return element.attr('switch-instance') ? null : function(element){
    var scope = this, childScope;
    element.attr('switch-instance', 'compiled');
    scope.$browser.xhr('GET', src, function(code, response){
      element.html(response);
      childScope = createScope(scope);
      compiler.compile(element)(element, childScope);
      childScope.$init();
    });
    scope.$onEval(function(){ if (childScope) childScope.$eval(); });
  };
});

angularWidget('NG:SWITCH', function(element){
  var compiler = this,
      watchExpr = element.attr("on"),
      cases = [];
  eachNode(element, function(caseElement){
    var when = caseElement.attr('ng-switch-when');
    if (when) {
      cases.push({
        when: function(value){ return value == when; },
        element: caseElement,
        template: compiler.compile(caseElement)
      });
    }
  });
  element.html('');
  return function(element){
    var scope = this;
    this.$watch(watchExpr, function(value){
      element.html('');
      foreach(cases, function(switchCase){
        if (switchCase.when(value)) {
          element.append(switchCase.element);
          var childScope = createScope(scope);
          switchCase.template(switchCase.element, childScope);
          childScope.$init();
        }
      });
    });
  };
});

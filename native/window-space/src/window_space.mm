#include <node_api.h>
#include <cstring>

#import <Cocoa/Cocoa.h>

namespace {

bool getPointerFromBuffer(napi_env env, napi_value value, void** pointerOut) {
  bool isBuffer = false;
  if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer) {
    return false;
  }

  void* data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok || data == nullptr || length == 0) {
    return false;
  }

  uintptr_t pointer = 0;
  const size_t copyLength = length < sizeof(uintptr_t) ? length : sizeof(uintptr_t);
  memcpy(&pointer, data, copyLength);
  *pointerOut = reinterpret_cast<void*>(pointer);
  return pointer != 0;
}

bool applyPiPStyleBehavior(void* nativeHandle) {
  __block bool applied = false;

  void (^applyBlock)(void) = ^{
    id nativeObject = (__bridge id)nativeHandle;
    NSWindow* window = nil;

    if ([nativeObject isKindOfClass:[NSWindow class]]) {
      window = (NSWindow*)nativeObject;
    } else if ([nativeObject isKindOfClass:[NSView class]]) {
      window = [(NSView*)nativeObject window];
    }

    if (window == nil) {
      return;
    }

    NSWindowCollectionBehavior behavior = [window collectionBehavior];
    behavior |= NSWindowCollectionBehaviorCanJoinAllSpaces;
    behavior |= NSWindowCollectionBehaviorMoveToActiveSpace;
    behavior |= NSWindowCollectionBehaviorFullScreenAuxiliary;
    behavior |= NSWindowCollectionBehaviorIgnoresCycle;
    [window setCollectionBehavior:behavior];

    [window setLevel:NSStatusWindowLevel];
    [window setHidesOnDeactivate:NO];
    applied = true;
  };

  if ([NSThread isMainThread]) {
    applyBlock();
  } else {
    dispatch_sync(dispatch_get_main_queue(), applyBlock);
  }

  return applied;
}

napi_value configurePiPWindow(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  bool applied = false;

  if (argc == 1) {
    void* nativeHandle = nullptr;
    if (getPointerFromBuffer(env, args[0], &nativeHandle)) {
      applied = applyPiPStyleBehavior(nativeHandle);
    }
  }

  napi_value result;
  napi_get_boolean(env, applied, &result);
  return result;
}

napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor descriptor = {
    "configurePiPWindow",
    nullptr,
    configurePiPWindow,
    nullptr,
    nullptr,
    nullptr,
    napi_default,
    nullptr,
  };

  napi_define_properties(env, exports, 1, &descriptor);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)

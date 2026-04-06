{
  "targets": [
    {
      "target_name": "window_space",
      "sources": ["src/window_space.mm"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "11.0"
      },
      "libraries": ["-framework Cocoa"]
    }
  ]
}

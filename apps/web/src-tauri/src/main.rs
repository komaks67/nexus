// Windows のリリース版で余計なコンソール画面を出さない
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nexus_desktop_lib::run()
}

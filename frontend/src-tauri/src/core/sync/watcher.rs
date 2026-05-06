use std::path::{Path, PathBuf};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc::{self, UnboundedReceiver};
use crate::error::CoreResult;

pub struct ConfigWatcher {
    _watcher: RecommendedWatcher,
    pub events: UnboundedReceiver<PathBuf>,
}

impl ConfigWatcher {
    pub fn watch(dirs: &[PathBuf]) -> CoreResult<Self> {
        let (tx, rx) = mpsc::unbounded_channel::<PathBuf>();

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(event) = res else { return };
            match event.kind {
                EventKind::Modify(_) | EventKind::Create(_) => {
                    for path in event.paths {
                        if is_cfg(&path) {
                            let _ = tx.send(path);
                        }
                    }
                }
                _ => {}
            }
        })?;

        for dir in dirs {
            watcher.watch(dir, RecursiveMode::NonRecursive)?;
        }

        Ok(Self { _watcher: watcher, events: rx })
    }
}

fn is_cfg(path: &Path) -> bool {
    path.extension().map(|e| e == "cfg").unwrap_or(false)
}

async function main() {
  const { getRawDb } = await import("../src/db/drizzle.ts");
  const rawDb = getRawDb();

  // Clean up all test data created during debugging sessions
  console.log("Cleaning up test data...");
  
  // Delete jobs
  const jobCount = rawDb.prepare("SELECT COUNT(*) as count FROM jobs").get() as any;
  rawDb.prepare("DELETE FROM jobs").run();
  console.log(`  Deleted ${jobCount.count} jobs`);
  
  // Delete list_tasks
  const ltaskCount = rawDb.prepare("SELECT COUNT(*) as count FROM list_tasks").get() as any;
  rawDb.prepare("DELETE FROM list_tasks").run();
  console.log(`  Deleted ${ltaskCount.count} list_tasks`);
  
  // Delete lists
  const listCount = rawDb.prepare("SELECT COUNT(*) as count FROM lists").get() as any;
  rawDb.prepare("DELETE FROM lists").run();
  console.log(`  Deleted ${listCount.count} lists`);
  
  // Delete rotations (keep the ones created by simulate-week)
  const rotCount = rawDb.prepare("SELECT COUNT(*) as count FROM rotations").get() as any;
  rawDb.prepare("DELETE FROM rotations").run();
  console.log(`  Deleted ${rotCount.count} rotations`);
  
  // Delete slate_tasks
  const stCount = rawDb.prepare("SELECT COUNT(*) as count FROM slate_tasks").get() as any;
  rawDb.prepare("DELETE FROM slate_tasks").run();
  console.log(`  Deleted ${stCount.count} slate_tasks`);
  
  // Delete slate_tags
  const stagCount = rawDb.prepare("SELECT COUNT(*) as count FROM slate_tags").get() as any;
  rawDb.prepare("DELETE FROM slate_tags").run();
  console.log(`  Deleted ${stagCount.count} slate_tags`);
  
  // Delete tasks (keep ones created by simulate-week)
  const taskCount = rawDb.prepare("SELECT COUNT(*) as count FROM tasks").get() as any;
  rawDb.prepare("DELETE FROM tasks").run();
  console.log(`  Deleted ${taskCount.count} tasks`);
  
  // Delete slates (keep ones created by simulate-week)
  const slateCount = rawDb.prepare("SELECT COUNT(*) as count FROM slates").get() as any;
  rawDb.prepare("DELETE FROM slates").run();
  console.log(`  Deleted ${slateCount.count} slates`);
  
  // Delete users (keep admin and children from simulate-week)
  const userCount = rawDb.prepare("SELECT COUNT(*) as count FROM users").get() as any;
  rawDb.prepare("DELETE FROM users WHERE role = 'child' OR email LIKE '%choretle%'").run();
  console.log(`  Deleted child/choretle users (kept ${userCount.count} total before)`);

  // Delete family if it's our test family
  const famCount = rawDb.prepare("SELECT COUNT(*) as count FROM families WHERE slug = 'my-family'").get() as any;
  if (famCount.count > 0) {
    rawDb.prepare("DELETE FROM families WHERE slug = 'my-family'").run();
    console.log(`  Deleted test family`);
  }

  // Reset auto-increment counters
  try {
    rawDb.prepare("DELETE FROM sqlite_sequence").run();
  } catch {}

  console.log("\nCleanup complete. Running simulate-week...");
}

main();

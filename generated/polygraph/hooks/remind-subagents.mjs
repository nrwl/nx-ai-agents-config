// Remind agents to use subagents for delegation and polling.
// Outputs a non-blocking systemMessage — does not prevent the tool call.
import { stdin } from 'node:process';

// Consume stdin (hook protocol requires it)
stdin.resume();
stdin.on('end', () => {});

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      systemMessage:
        'REMINDER: polygraph_delegate and polygraph_child_status should be called via background subagents (polygraph-delegate-subagent), not directly. Direct calls flood the context window with polling noise. If you are already inside a subagent, ignore this reminder.',
    },
  })
);

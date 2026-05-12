import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const scriptName = body.script;

    if (!scriptName || typeof scriptName !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid script name' }, { status: 400 });
    }

    // Security check: only allow safe alphanumeric script names with .py extension
    if (!/^[a-zA-Z0-9_]+\.py$/.test(scriptName)) {
      return NextResponse.json({ error: 'Invalid script name format' }, { status: 400 });
    }

    const command = `cd /home/admin/Documents && ./venv/bin/python ${scriptName}`;
    
    console.log(`[Hardware API] Executing: ${command}`);

    // Execute the python script
    try {
      const { stdout, stderr } = await execAsync(command);
      console.log(`[Hardware API] Success: ${stdout}`);
      if (stderr) console.error(`[Hardware API] Stderr: ${stderr}`);
      return NextResponse.json({ success: true, output: stdout });
    } catch (execError: any) {
      console.error(`[Hardware API] Execution failed:`, execError);
      return NextResponse.json(
        { error: 'Failed to execute hardware script', details: execError.message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(`[Hardware API] Invalid request:`, error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

import React, { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  Plus,
  Search,
  Filter,
  Kanban,
  List as ListIcon,
  Calendar,
  User,
  Clock,
  Tag,
  AlertCircle,
  MoreHorizontal,
  Trash2,
  Edit2,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Users,
  Flag,
  ArrowUpDown,
  CheckSquare,
} from "lucide-react";
import {
  api,
  ProjectTask,
  TaskMember,
  TaskStats,
  TaskStatus,
  TaskPriority,
  TaskSubtask,
} from "../../lib/api";

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  todo: {
    label: "To Do",
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    dot: "bg-slate-400",
  },
  in_progress: {
    label: "In Progress",
    bg: "bg-sky-50",
    text: "text-sky-800",
    border: "border-sky-200",
    dot: "bg-sky-500",
  },
  in_review: {
    label: "In Review",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  done: {
    label: "Completed",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
};

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; color: string; badge: string }
> = {
  urgent: {
    label: "Urgent",
    color: "text-rose-600",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
  },
  high: {
    label: "High",
    color: "text-amber-600",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
  },
  medium: {
    label: "Medium",
    color: "text-sky-600",
    badge: "bg-sky-50 text-sky-700 border-sky-200",
  },
  low: {
    label: "Low",
    color: "text-slate-500",
    badge: "bg-slate-50 text-slate-600 border-slate-200",
  },
};

const AVATAR_COLORS: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  sky: "bg-sky-100 text-sky-800 border-sky-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  indigo: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

const DEFAULT_MEMBERS: TaskMember[] = [
  { id: "m1", name: "Hannes Aboagye", role: "Lead Systems Architect", initials: "HA", email: "hannes@okp.telecom", color: "amber" },
  { id: "m2", name: "Theo Tetteh", role: "Voice & Telephony Engineer", initials: "TT", email: "theo@okp.telecom", color: "emerald" },
  { id: "m3", name: "Ama Serwaa", role: "Financial Compliance Officer", initials: "AS", email: "ama@okp.telecom", color: "sky" },
  { id: "m4", name: "Kwame Boateng", role: "Audio & Akan Linguist", initials: "KB", email: "kwame@okp.telecom", color: "purple" },
];

export const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [members, setMembers] = useState<TaskMember[]>(DEFAULT_MEMBERS);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);

  // View state
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Selected task for detailed drawer/modal
  const [activeTask, setActiveTask] = useState<ProjectTask | null>(null);
  const [isEditingTask, setIsEditingTask] = useState(false);

  // New task modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStatus, setNewStatus] = useState<TaskStatus>("todo");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newTags, setNewTags] = useState("Telephony");
  const [newSection, setNewSection] = useState("Sprint 4: Telephony Backbone");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Quick inline add in list/board
  const [quickAddColumn, setQuickAddColumn] = useState<TaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");

  // Subtask addition inside drawer
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  // Celebratory feedback banner when completing tasks
  const [celebrationMsg, setCelebrationMsg] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const data = await api.getTasks();
      const safeMembers = Array.isArray(data?.members) && data.members.length > 0 ? data.members : DEFAULT_MEMBERS;
      const rawTasks = Array.isArray(data?.tasks) ? data.tasks : [];
      const safeTasks: ProjectTask[] = rawTasks.map((t: any) => ({
        ...t,
        tags: Array.isArray(t.tags) ? t.tags : [],
        subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
        assignee: t.assignee || safeMembers[0],
      }));
      setTasks(safeTasks);
      setMembers(safeMembers);
      if (data?.stats) setStats(data.stats);
      if (safeMembers.length > 0 && !newAssigneeId) {
        setNewAssigneeId(safeMembers[0].id);
      }
    } catch (err) {
      console.warn("Tasks load failed:", err);
      setTasks([]);
      setMembers(DEFAULT_MEMBERS);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTaskStatus = async (task: ProjectTask, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextStatus: TaskStatus = task.status === "done" ? "in_progress" : "done";
    const optimisticTasks = tasks.map((t) =>
      t.id === task.id
        ? {
            ...t,
            status: nextStatus,
            completedAt: nextStatus === "done" ? new Date().toISOString() : null,
          }
        : t
    );
    setTasks(optimisticTasks);

    if (activeTask && activeTask.id === task.id) {
      setActiveTask({
        ...activeTask,
        status: nextStatus,
        completedAt: nextStatus === "done" ? new Date().toISOString() : null,
      });
    }

    if (nextStatus === "done") {
      setCelebrationMsg(`🎉 Task "${task.title}" completed!`);
      setTimeout(() => setCelebrationMsg(null), 3500);
    }

    try {
      const res = await api.updateTask(task.id, { status: nextStatus });
      if (res.success) {
        await loadTasks();
      }
    } catch (err) {
      console.warn("Failed to toggle status:", err);
      await loadTasks();
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const optimisticTasks = tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status: newStatus,
            completedAt: newStatus === "done" ? new Date().toISOString() : null,
          }
        : t
    );
    setTasks(optimisticTasks);

    if (activeTask && activeTask.id === taskId) {
      setActiveTask({
        ...activeTask,
        status: newStatus,
        completedAt: newStatus === "done" ? new Date().toISOString() : null,
      });
    }

    try {
      await api.updateTask(taskId, { status: newStatus });
      await loadTasks();
    } catch (err) {
      console.warn("Failed to update status:", err);
      await loadTasks();
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreateSubmitting(true);
    try {
      const tagList = newTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await api.createTask({
        title: newTitle.trim(),
        description: newDescription.trim(),
        status: newStatus,
        priority: newPriority,
        assigneeId: newAssigneeId || (members[0] ? members[0].id : undefined),
        dueDate: newDueDate || new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
        tags: tagList.length > 0 ? tagList : ["General"],
        section: newSection,
      });

      if (res.success) {
        setIsCreateModalOpen(false);
        setNewTitle("");
        setNewDescription("");
        await loadTasks();
      }
    } catch (err) {
      console.warn("Task creation error:", err);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleQuickAdd = async (column: TaskStatus) => {
    if (!quickAddTitle.trim()) return;
    const title = quickAddTitle.trim();
    setQuickAddTitle("");
    setQuickAddColumn(null);

    try {
      const res = await api.createTask({
        title,
        status: column,
        priority: "medium",
        assigneeId: members[0]?.id,
        section: "Sprint 4: Telephony Backbone",
      });
      if (res.success) {
        await loadTasks();
      }
    } catch (err) {
      console.warn("Quick add error:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      await api.deleteTask(taskId);
      if (activeTask?.id === taskId) {
        setActiveTask(null);
      }
      await loadTasks();
    } catch (err) {
      console.warn("Delete error:", err);
    }
  };

  const handleToggleSubtask = async (subtaskId: string) => {
    if (!activeTask) return;
    const updatedSubtasks = activeTask.subtasks.map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );

    const updatedTask = { ...activeTask, subtasks: updatedSubtasks };
    setActiveTask(updatedTask);
    setTasks(tasks.map((t) => (t.id === activeTask.id ? updatedTask : t)));

    try {
      await api.updateTask(activeTask.id, { subtasks: updatedSubtasks });
    } catch (err) {
      console.warn("Subtask update failed:", err);
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask || !newSubtaskTitle.trim()) return;
    const newSt: TaskSubtask = {
      id: `sub-${Date.now()}`,
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    const updatedSubtasks = [...activeTask.subtasks, newSt];
    const updatedTask = { ...activeTask, subtasks: updatedSubtasks };

    setActiveTask(updatedTask);
    setNewSubtaskTitle("");
    setTasks(tasks.map((t) => (t.id === activeTask.id ? updatedTask : t)));

    try {
      await api.updateTask(activeTask.id, { subtasks: updatedSubtasks });
    } catch (err) {
      console.warn("Add subtask failed:", err);
    }
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchSearch =
        searchQuery.trim() === "" ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchMember = selectedMember === "all" || task.assignee?.id === selectedMember;
      const matchPriority = selectedPriority === "all" || task.priority === selectedPriority;
      const matchStatus = selectedStatus === "all" || task.status === selectedStatus;

      return matchSearch && matchMember && matchPriority && matchStatus;
    });
  }, [tasks, searchQuery, selectedMember, selectedPriority, selectedStatus]);

  // Grouped tasks by status for Board View
  const tasksByStatus: Record<TaskStatus, ProjectTask[]> = {
    todo: filteredTasks.filter((t) => t.status === "todo"),
    in_progress: filteredTasks.filter((t) => t.status === "in_progress"),
    in_review: filteredTasks.filter((t) => t.status === "in_review"),
    done: filteredTasks.filter((t) => t.status === "done"),
  };

  const columns: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Celebration Toast */}
      {celebrationMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-lg border border-emerald-500 font-bold text-xs animate-bounce">
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{celebrationMsg}</span>
        </div>
      )}

      {/* ── Page Header (Executive Asana White Design) ───────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Team Tasks &amp; Delivery Board
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Asana-style sprint backlog and live delivery tracker for Ɔkwankyerɛfo Pa telephony voice codes,
            MTN MoMo sandbox APIs, and bilingual audio rollouts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle (Board vs List) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                viewMode === "board"
                  ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                viewMode === "list"
                  ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          {/* Add Task Button */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4 text-amber-300" />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {/* ── Sprint Progress & Metrics Bar ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500">Total Backlog</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats?.total ?? tasks.length}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Active Sprint Items</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500">Completed</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{stats?.completed ?? 0}</div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
            {stats?.completionRate ?? 0}% Sprint Velocity
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500">In Progress</div>
          <div className="text-2xl font-black text-sky-700 mt-1">{stats?.inProgress ?? 0}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Under Active Execution</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500">In Review / QA</div>
          <div className="text-2xl font-black text-amber-700 mt-1">{stats?.inReview ?? 0}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Verification Gate</div>
        </div>

        <div className="col-span-2 sm:col-span-1 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Overall Progress</span>
            <span className="font-bold text-slate-900">{stats?.completionRate ?? 0}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden my-1.5 border border-slate-200/60">
            <div
              className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${stats?.completionRate ?? 0}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {stats?.completed ?? 0} of {stats?.total ?? tasks.length} shipped
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls ─────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search task title, description, or tag (e.g. Telephony, MoMo, Zero-PIN)..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Member Filter */}
          <select
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">All Assignees</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.initials})
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Completed</option>
          </select>

          {(searchQuery || selectedMember !== "all" || selectedPriority !== "all" || selectedStatus !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedMember("all");
                setSelectedPriority("all");
                setSelectedStatus("all");
              }}
              className="px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── VIEW 1: ASANA KANBAN BOARD ───────────────────────────────── */}
      {viewMode === "board" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {columns.map((colKey) => {
            const colConfig = STATUS_CONFIG[colKey];
            const colTasks = tasksByStatus[colKey];

            return (
              <div
                key={colKey}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col min-h-[500px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${colConfig.dot}`} />
                    <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                      {colConfig.label}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.2 bg-slate-100 rounded-full font-bold text-slate-600">
                      {colTasks.length}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setQuickAddColumn(colKey);
                      setQuickAddTitle("");
                    }}
                    className="p-1 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                    title={`Add task to ${colConfig.label}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Inline Quick Add Form */}
                {quickAddColumn === colKey && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-3 space-y-2">
                    <input
                      type="text"
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleQuickAdd(colKey);
                        if (e.key === "Escape") setQuickAddColumn(null);
                      }}
                      placeholder="Task name... (Press Enter)"
                      autoFocus
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setQuickAddColumn(null)}
                        className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleQuickAdd(colKey)}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-bold hover:bg-emerald-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Task Cards List */}
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-0.5">
                  {colTasks.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-1">
                      <Circle className="w-6 h-6 text-slate-200" />
                      <span>No tasks in {colConfig.label}</span>
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const priorityConfig = PRIORITY_CONFIG[task.priority];
                      const avatarClass = AVATAR_COLORS[task.assignee?.color] || AVATAR_COLORS.emerald;
                      const completedCount = task.subtasks.filter((s) => s.completed).length;

                      return (
                        <div
                          key={task.id}
                          onClick={() => setActiveTask(task)}
                          className={`p-4 bg-white rounded-xl border transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-md hover:border-slate-300 relative group ${
                            task.status === "done" ? "border-emerald-200 bg-emerald-50/10" : "border-slate-200"
                          }`}
                        >
                          {/* Card Top: Checkbox + Priority & ID */}
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={(e) => handleToggleTaskStatus(task, e)}
                              className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors shrink-0"
                              title={task.status === "done" ? "Mark incomplete" : "Mark completed"}
                            >
                              {task.status === "done" ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                              ) : (
                                <Circle className="w-4 h-4 hover:stroke-emerald-600" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="text-[10px] font-mono font-bold text-slate-400">
                                  {task.id}
                                </span>
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${priorityConfig.badge}`}
                                >
                                  {priorityConfig.label}
                                </span>
                              </div>

                              <h3
                                className={`text-xs font-bold leading-snug ${
                                  task.status === "done"
                                    ? "line-through text-slate-400"
                                    : "text-slate-900 group-hover:text-emerald-700 transition-colors"
                                }`}
                              >
                                {task.title}
                              </h3>
                            </div>
                          </div>

                          {/* Card Description Snippet */}
                          {task.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          {/* Subtasks Progress */}
                          {(task.subtasks?.length ?? 0) > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 mt-2.5">
                              <CheckSquare className="w-3 h-3 text-slate-400" />
                              <span>
                                {completedCount}/{(task.subtasks || []).length} subtasks
                              </span>
                            </div>
                          )}

                          {/* Tags */}
                          {(task.tags?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2.5">
                              {(task.tags || []).map((tg) => (
                                <span
                                  key={tg}
                                  className="text-[9px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"
                                >
                                  #{tg}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Card Footer: Assignee & Due Date */}
                          <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-[11px]">
                            {/* Assignee Avatar */}
                            <div className="flex items-center gap-1.5 truncate">
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] border ${avatarClass}`}
                                title={task.assignee?.name}
                              >
                                {task.assignee?.initials || "TT"}
                              </div>
                              <span className="text-slate-600 truncate text-[11px] font-medium">
                                {task.assignee?.name.split(" ")[0]}
                              </span>
                            </div>

                            {/* Due Date */}
                            <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 shrink-0">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{task.dueDate.slice(5)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add task button at bottom */}
                <button
                  onClick={() => {
                    setQuickAddColumn(colKey);
                    setQuickAddTitle("");
                  }}
                  className="mt-3 py-2 text-xs font-bold text-slate-500 hover:text-emerald-700 hover:bg-slate-50 rounded-xl border border-dashed border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── VIEW 2: ASANA LIST VIEW ─────────────────────────────────── */}
      {viewMode === "list" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 pl-4 pr-2 w-10">Done</th>
                  <th className="py-3.5 px-3 min-w-[260px]">Task Name</th>
                  <th className="py-3.5 px-3 min-w-[140px]">Assignee</th>
                  <th className="py-3.5 px-3 min-w-[120px]">Due Date</th>
                  <th className="py-3.5 px-3 min-w-[120px]">Priority</th>
                  <th className="py-3.5 px-3 min-w-[130px]">Status</th>
                  <th className="py-3.5 px-3 min-w-[160px]">Tags</th>
                  <th className="py-3.5 pr-4 pl-2 w-12 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                      No matching tasks found.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const priorityConfig = PRIORITY_CONFIG[task.priority];
                    const statusConfig = STATUS_CONFIG[task.status];
                    const avatarClass = AVATAR_COLORS[task.assignee?.color] || AVATAR_COLORS.emerald;

                    return (
                      <tr
                        key={task.id}
                        onClick={() => setActiveTask(task)}
                        className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                          task.status === "done" ? "bg-emerald-50/15" : ""
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 pl-4 pr-2">
                          <button
                            type="button"
                            onClick={(e) => handleToggleTaskStatus(task, e)}
                            className="text-slate-400 hover:text-emerald-600 transition-colors"
                          >
                            {task.status === "done" ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                            ) : (
                              <Circle className="w-4 h-4 hover:stroke-emerald-600" />
                            )}
                          </button>
                        </td>

                        {/* Title & Section */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-xs text-slate-900 leading-snug">
                            <span
                              className={
                                task.status === "done" ? "line-through text-slate-400 font-normal" : ""
                              }
                            >
                              {task.title}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {task.id} · {task.section}
                          </div>
                        </td>

                        {/* Assignee */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] border ${avatarClass}`}
                            >
                              {task.assignee?.initials || "TT"}
                            </div>
                            <span className="font-medium text-slate-700 truncate">
                              {task.assignee?.name}
                            </span>
                          </div>
                        </td>

                        {/* Due Date */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 font-mono text-slate-600">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{task.dueDate}</span>
                          </div>
                        </td>

                        {/* Priority */}
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${priorityConfig.badge}`}
                          >
                            <Flag className="w-2.5 h-2.5" />
                            <span>{priorityConfig.label}</span>
                          </span>
                        </td>

                        {/* Status Dropdown */}
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={task.status}
                            onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${statusConfig.border} ${statusConfig.bg} ${statusConfig.text} focus:outline-none`}
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="in_review">In Review</option>
                            <option value="done">Completed</option>
                          </select>
                        </td>

                        {/* Tags */}
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {(task.tags || []).map((tg) => (
                              <span
                                key={tg}
                                className="text-[9px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"
                              >
                                #{tg}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Delete action */}
                        <td className="py-3 pr-4 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TASK DETAIL MODAL / DRAWER ───────────────────────────────── */}
      {activeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Drawer Top Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleTaskStatus(activeTask)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs transition-colors bg-white shadow-2xs hover:bg-slate-50"
                >
                  {activeTask.status === "done" ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                      <span className="text-emerald-700">Completed</span>
                    </>
                  ) : (
                    <>
                      <Circle className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700">Mark Completed</span>
                    </>
                  )}
                </button>
                <span className="font-mono text-xs text-slate-400 font-bold">{activeTask.id}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDeleteTask(activeTask.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  title="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveTask(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Task Title */}
              <div>
                <h2 className="text-xl font-black text-slate-900 leading-snug">
                  {activeTask.title}
                </h2>
                <div className="text-xs text-slate-500 mt-1">{activeTask.section}</div>
              </div>

              {/* Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs">
                {/* Status */}
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Status</div>
                  <select
                    value={activeTask.status}
                    onChange={(e) => handleStatusChange(activeTask.id, e.target.value as TaskStatus)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Completed</option>
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Priority</div>
                  <select
                    value={activeTask.priority}
                    onChange={async (e) => {
                      const pri = e.target.value as TaskPriority;
                      setActiveTask({ ...activeTask, priority: pri });
                      await api.updateTask(activeTask.id, { priority: pri });
                      await loadTasks();
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                {/* Assignee */}
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Assignee</div>
                  <select
                    value={activeTask.assignee?.id}
                    onChange={async (e) => {
                      const member = members.find((m) => m.id === e.target.value);
                      if (member) {
                        setActiveTask({ ...activeTask, assignee: member });
                        await api.updateTask(activeTask.id, { assigneeId: member.id });
                        await loadTasks();
                      }
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Due Date */}
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Due Date</div>
                  <input
                    type="date"
                    value={activeTask.dueDate}
                    onChange={async (e) => {
                      const date = e.target.value;
                      setActiveTask({ ...activeTask, dueDate: date });
                      await api.updateTask(activeTask.id, { dueDate: date });
                      await loadTasks();
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">Description</span>
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                  {activeTask.description || "No description provided."}
                </p>
              </div>

              {/* Subtasks Checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Subtasks Checklist</span>
                  <span className="text-[11px] font-mono font-bold text-slate-500">
                    {(activeTask.subtasks || []).filter((s) => s.completed).length}/{(activeTask.subtasks || []).length} Completed
                  </span>
                </div>

                <div className="space-y-1.5">
                  {(activeTask.subtasks || []).map((st) => (
                    <div
                      key={st.id}
                      onClick={() => handleToggleSubtask(st.id)}
                      className="flex items-center gap-2.5 p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-100 cursor-pointer transition-colors"
                    >
                      {st.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span
                        className={`text-xs ${
                          st.completed ? "line-through text-slate-400" : "text-slate-800"
                        }`}
                      >
                        {st.title}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Add Subtask input */}
                <form onSubmit={handleAddSubtask} className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add a subtask..."
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    Add
                  </button>
                </form>
              </div>

              {/* Tags Section */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">Project Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {(activeTask.tags || []).map((tg) => (
                    <span
                      key={tg}
                      className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                    >
                      #{tg}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Bottom Bar */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-[11px] text-slate-500">
              <span>Created {new Date(activeTask.createdAt).toLocaleDateString()}</span>
              {activeTask.completedAt && (
                <span className="text-emerald-700 font-bold">
                  Completed on {new Date(activeTask.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE TASK MODAL ────────────────────────────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-900">Create New Team Task</h2>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Task Title <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Test Africa's Talking DTMF Tone Callback"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Details, requirements, acceptance criteria..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Initial Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assignee</label>
                  <select
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.initials})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="Telephony, MoMo, QA"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sprint Section</label>
                  <input
                    type="text"
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    placeholder="Sprint 4: Telephony Backbone"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {createSubmitting ? "Creating..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

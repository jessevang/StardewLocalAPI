using System.Collections.Generic;

namespace StardewLocalAPI.Core
{
    internal sealed class ProjectsIndex
    {
        public List<ProjectListItem>? projects { get; set; }
    }

    internal sealed class ProjectListItem
    {
        public string id { get; set; } = "";
        public string name { get; set; } = "";
        public long ts { get; set; }
        public int eventCount { get; set; }
    }

    internal sealed class ProjectEnvelope
    {
        public string? id { get; set; }
        public string? name { get; set; }
        public long ts { get; set; }
        public int v { get; set; }
        public object? manifest { get; set; }
        public object? settings { get; set; }

        public ProjectDocumentsEnvelope? documents { get; set; }
    }

    internal sealed class ProjectDocumentsEnvelope
    {
        public List<ProjectEventDocument>? events { get; set; }
    }

    internal sealed class ProjectEventDocument
    {
        public string? id { get; set; }
        public string? name { get; set; }
        public long ts { get; set; }
        public int v { get; set; }

        public ProjectEventHeader? header { get; set; }
        public object? state { get; set; }
    }

    internal sealed class ProjectEventHeader
    {
        public string? location { get; set; }
        public string? eventId { get; set; }
        public string? music { get; set; }
        public int viewX { get; set; }
        public int viewY { get; set; }
        public string? patchMode { get; set; }
    }
}
from django.contrib import admin
from .models import Space, SpaceResponsibility


@admin.register(Space)
class SpaceAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "capacity", "location", "is_active")
    list_filter = ("category", "is_active")
    search_fields = ("name", "description", "location")
    ordering = ("name",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(SpaceResponsibility)
class SpaceResponsibilityAdmin(admin.ModelAdmin):
    list_display = ("user", "space", "assignment_date", "is_active")
    list_filter = ("is_active",)
    search_fields = ("user__username", "space__name")

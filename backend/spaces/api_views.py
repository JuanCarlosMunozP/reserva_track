from rest_framework import permissions, viewsets

from common.permissions import HasRolePermission
from users.models import User

from .api_serializers import SpaceResponsibilitySerializer, SpaceSerializer
from .models import Space, SpaceResponsibility


class SpaceViewSet(viewsets.ModelViewSet):
    queryset = Space.objects.all()
    serializer_class = SpaceSerializer
    permission_resource = "spaces"
    filterset_fields = ("category", "is_active")
    search_fields = ("name", "description", "location")
    ordering_fields = ("name", "capacity", "created_at")

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return (permissions.AllowAny(),)
        return (permissions.IsAuthenticated(), HasRolePermission())

    def perform_destroy(self, instance):
        # FR-018: un espacio con reservas se desactiva en vez de borrarse.
        if instance.reservations.exists():
            instance.is_active = False
            instance.save(update_fields=("is_active",))
            return
        instance.delete()


class SpaceResponsibilityViewSet(viewsets.ModelViewSet):
    queryset = SpaceResponsibility.objects.select_related("user", "space").order_by("-assignment_date", "-id")
    serializer_class = SpaceResponsibilitySerializer
    permission_classes = (permissions.IsAuthenticated, HasRolePermission)
    permission_resource = "responsibilities"
    filterset_fields = ("space", "user", "is_active")

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not isinstance(user, User):
            return queryset.none()
        if user.is_superuser or user.role == "admin":
            return queryset
        if user.type == "teacher":
            return queryset.filter(user=user, is_active=True)
        if user.type == "personal_administrator":
            return queryset.filter(
                space__responsibilities__user=user,
                space__responsibilities__is_active=True,
            ).distinct()
        return queryset.none()